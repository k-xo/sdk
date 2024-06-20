const fs = require("fs");
const path = require("path");

const SOURCE_DIRECTORY = path.resolve(__dirname, "../src");
const PUBLIC_API_SWAGGER_PATH = path.resolve(
  `${SOURCE_DIRECTORY}/__inputs__`,
  "public_api.swagger.json"
);
const TARGET_API_TYPES_PATH = path.resolve(
  `${SOURCE_DIRECTORY}/__generated__`,
  "sdk_api_types.ts"
);
const TARGET_SDK_CLIENT_PATH = path.resolve(
  `${SOURCE_DIRECTORY}/__generated__`,
  "sdk-client-base.ts"
);

const COMMENT_HEADER = "/* @generated by codegen. DO NOT EDIT BY HAND */";

const VERSIONED_ACTIVITY_TYPES = {
  ACTIVITY_TYPE_CREATE_AUTHENTICATORS: "ACTIVITY_TYPE_CREATE_AUTHENTICATORS_V2",
  ACTIVITY_TYPE_CREATE_POLICY: "ACTIVITY_TYPE_CREATE_POLICY_V3",
  ACTIVITY_TYPE_CREATE_PRIVATE_KEYS: "ACTIVITY_TYPE_CREATE_PRIVATE_KEYS_V2",
  ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION:
    "ACTIVITY_TYPE_CREATE_SUB_ORGANIZATION_V5",
  ACTIVITY_TYPE_CREATE_USERS: "ACTIVITY_TYPE_CREATE_USERS_V2",
  ACTIVITY_TYPE_SIGN_RAW_PAYLOAD: "ACTIVITY_TYPE_SIGN_RAW_PAYLOAD_V2",
  ACTIVITY_TYPE_SIGN_TRANSACTION: "ACTIVITY_TYPE_SIGN_TRANSACTION_V2",
};

const METHODS_WITH_ONLY_OPTIONAL_PARAMETERS = [
  "getActivities",
  "getApiKeys",
  "getOrganization",
  "getPolicies",
  "getPrivateKeys",
  "getSubOrgIds",
  "getUsers",
  "getWallets",
  "getWhoami",
  "listPrivateKeys",
  "listUserTags",
];

// Helper Functions
/**
 * @param {Array<string | null>} input
 * @returns {string}
 */
function joinPropertyList(input) {
  return input.filter(Boolean).join(",\n");
}

/**
 * @param {string} methodName
 * @returns {string}
 */
function methodTypeFromMethodName(methodName) {
  if (["approveActivity", "rejectActivity"].includes(methodName)) {
    return "activityDecision";
  }
  if (methodName.startsWith("nOOP")) {
    return "noop";
  }
  if (methodName.startsWith("get") || methodName.startsWith("list")) {
    return "query";
  }
  // Rename to submit?
  return "command";
}

// Helper that takes in swagger definitions and returns a map containing the latest version of a field.
// The intent is to consolidate a field with multiple versions (e.g. v1CreateSubOrganizationResult, v1CreateSubOrganizationResultV2...)
// in order to get just the latest (v1CreateSubOrganizationResultV4).
function extractLatestVersions(definitions) {
  const latestVersions = {};

  // Regex to separate the version prefix, base activity details, and (optional) activity version
  const keyVersionRegex = /^(v\d+)([A-Z][a-z]+(?:[A-Z][a-z]+)*)(V\d+)?$/;

  Object.keys(definitions).forEach((key) => {
    const match = key.match(keyVersionRegex);
    if (match) {
      const fullName = match[0];
      const _defaultPrefix = match[1]; // This is simply the namespace prefix; every field has this "v1"
      const baseName = match[2]; // Field without any version-related prefixes or suffixes
      const versionSuffix = match[3]; // Version (optional)
      const formattedKeyName =
        baseName.charAt(0).toLowerCase() +
        baseName.slice(1) +
        (versionSuffix || ""); // Reconstruct the original key with version

      // Determine if this version is newer or if no version was previously stored
      if (
        !latestVersions[baseName] ||
        versionSuffix > (latestVersions[baseName].versionSuffix || "")
      ) {
        latestVersions[baseName] = {
          fullName,
          formattedKeyName,
          versionSuffix,
        };
      }
    }
  });

  return latestVersions;
}

// Generators
const generateApiTypesFromSwagger = async (swaggerSpec, targetPath) => {
  const namespace = swaggerSpec.tags?.find((item) => item.name != null)?.name;

  /** @type {Array<string>} */
  const codeBuffer = [];

  /** @type {Array<string>} */
  const imports = [];

  imports.push(
    'import type { operations } from "../__inputs__/public_api.types";'
  );

  imports.push(
    'import type { queryOverrideParams, commandOverrideParams, ActivityMetadata } from "../__types__/base";'
  );

  const latestVersions = extractLatestVersions(swaggerSpec.definitions);

  for (const endpointPath in swaggerSpec.paths) {
    const methodMap = swaggerSpec.paths[endpointPath];
    const operation = methodMap.post;
    const operationId = operation.operationId;

    const operationNameWithoutNamespace = operationId.replace(
      new RegExp(`${namespace}_`),
      ""
    );

    const methodName = `${
      operationNameWithoutNamespace.charAt(0).toLowerCase() +
      operationNameWithoutNamespace.slice(1)
    }`;

    const methodType = methodTypeFromMethodName(methodName);

    const parameterList = operation["parameters"] ?? [];

    let responseValue = "void";
    if (methodType === "command") {
      const resultKey = operationNameWithoutNamespace + "Result";
      const versionedMethodName = latestVersions[resultKey].formattedKeyName;

      responseValue = `operations["${operationId}"]["responses"]["200"]["schema"]["activity"]["result"]["${versionedMethodName}"] & ActivityMetadata`;
    } else if (["noop", "query"].includes(methodType)) {
      responseValue = `operations["${operationId}"]["responses"]["200"]["schema"]`;
    } else if (methodType === "activityDecision") {
      responseValue = `operations["${operationId}"]["responses"]["200"]["schema"]["activity"]["result"] & ActivityMetadata`;
    }

    /** @type {TBinding} */
    const responseTypeBinding = {
      name: `T${operationNameWithoutNamespace}Response`,
      isBound: true,
      value: operation.responses["200"] == null ? `void` : responseValue,
    };

    let bodyValue = "{}";
    if (["activityDecision", "command"].includes(methodType)) {
      bodyValue = `operations["${operationId}"]["parameters"]["body"]["body"]["parameters"] & commandOverrideParams`;
    } else if (methodType === "query") {
      bodyValue = `Omit<operations["${operationId}"]["parameters"]["body"]["body"], "organizationId"> & queryOverrideParams`;
    }

    /** @type {TBinding} */
    const bodyTypeBinding = {
      name: `T${operationNameWithoutNamespace}Body`,
      isBound: parameterList.find((item) => item.in === "body") != null,
      value: bodyValue,
    };

    // What are these used for?
    /** @type {TBinding} */
    const queryTypeBinding = {
      name: `T${operationNameWithoutNamespace}Query`,
      isBound: parameterList.find((item) => item.in === "query") != null,
      value: `operations["${operationId}"]["parameters"]["query"]`,
    };

    /** @type {TBinding} */
    const substitutionTypeBinding = {
      name: `T${operationNameWithoutNamespace}Substitution`,
      isBound: parameterList.find((item) => item.in === "path") != null,
      value: `operations["${operationId}"]["parameters"]["path"]`,
    };

    /** @type {TBinding} */
    const inputTypeBinding = {
      name: `T${operationNameWithoutNamespace}Input`,
      isBound:
        bodyTypeBinding.isBound ||
        queryTypeBinding.isBound ||
        substitutionTypeBinding.isBound,
      value: `{ ${joinPropertyList([
        bodyTypeBinding.isBound ? `body: ${bodyTypeBinding.name}` : null,
        queryTypeBinding.isBound ? `query: ${queryTypeBinding.name}` : null,
        substitutionTypeBinding.isBound
          ? `substitution: ${substitutionTypeBinding.name}`
          : null,
      ])} }`,
    };

    // local type aliases
    codeBuffer.push(
      ...[queryTypeBinding, substitutionTypeBinding]
        .filter((binding) => binding.isBound)
        .map((binding) => `type ${binding.name} = ${binding.value};`)
    );

    // exported type aliases
    codeBuffer.push(
      ...[responseTypeBinding, inputTypeBinding, bodyTypeBinding]
        .filter((binding) => binding.isBound)
        .map((binding) => `export type ${binding.name} = ${binding.value};`)
    );
  }

  await fs.promises.writeFile(
    targetPath,
    [COMMENT_HEADER].concat(imports).concat(codeBuffer).join("\n\n")
  );
};

const generateSDKClientFromSwagger = async (swaggerSpec, targetPath) => {
  const namespace = swaggerSpec.tags?.find((item) => item.name != null)?.name;

  /** @type {Array<string>} */
  const codeBuffer = [];

  /** @type {Array<string>} */
  const imports = [];

  imports.push(
    'import { GrpcStatus, TurnkeyRequestError, ActivityResponse, TurnkeySDKClientConfig } from "../__types__/base";'
  );

  imports.push('import { VERSION } from "../__generated__/version";');

  imports.push('import type * as SdkApiTypes from "./sdk_api_types";');

  codeBuffer.push(`
export class TurnkeySDKClientBase {
  config: TurnkeySDKClientConfig;

  constructor(config: TurnkeySDKClientConfig) {
    this.config = config;
  }

  async request<TBodyType, TResponseType>(
    url: string,
    body: TBodyType
  ): Promise<TResponseType> {
    const fullUrl = this.config.apiBaseUrl + url;
    const stringifiedBody = JSON.stringify(body);
    const stamp = await this.config.stamper.stamp(stringifiedBody);

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        [stamp.stampHeaderName]: stamp.stampHeaderValue,
        "X-Client-Version": VERSION
      },
      body: stringifiedBody,
      redirect: "follow"
    });

    if (!response.ok) {
      let res: GrpcStatus;
      try {
        res = await response.json();
      } catch (_) {
        throw new Error(\`\${response.status} \${response.statusText}\`);
      }

      throw new TurnkeyRequestError(res);
    }

    const data = await response.json();
    return data as TResponseType;
  }

  async command<TBodyType, TResponseType>(
    url: string,
    body: TBodyType,
    resultKey: string
  ): Promise<TResponseType> {
    const POLLING_DURATION = this.config.activityPoller?.duration ?? 1000;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const responseData = await this.request<TBodyType, TResponseType>(url, body) as ActivityResponse;
    const activityId = responseData["activity"]["id"];
    const activityStatus = responseData["activity"]["status"];

    if (activityStatus !== "ACTIVITY_STATUS_PENDING") {
      return {
        ...responseData["activity"]["result"][\`\${resultKey}\`],
        activity: {
          id: activityId,
          status: activityStatus
        }
      } as TResponseType;
    }

    const pollStatus = async (): Promise<TResponseType> => {
      const pollBody = { activityId: activityId };
      const pollData = await this.getActivity(pollBody) as ActivityResponse;
      const activityStatus = pollData["activity"]["status"];

      if (activityStatus === "ACTIVITY_STATUS_PENDING") {
        await delay(POLLING_DURATION);
        return await pollStatus();
      } else {
        return {
          ...pollData["activity"]["result"][\`\${resultKey}\`],
          activity: {
            id: activityId,
            status: activityStatus
          }
        } as TResponseType;
      }
    }

    return await pollStatus();
  }

  async activityDecision<TBodyType, TResponseType>(
    url: string,
    body: TBodyType
  ): Promise<TResponseType> {
    const data = await this.request(url, body) as ActivityResponse;
    const activityId = data["activity"]["id"];
    const activityStatus = data["activity"]["status"];
    return {
      ...data["activity"]["result"],
      activity: {
        id: activityId,
        status: activityStatus
      }
    } as TResponseType;
  }

  `);

  const latestVersions = extractLatestVersions(swaggerSpec.definitions);

  for (const endpointPath in swaggerSpec.paths) {
    const methodMap = swaggerSpec.paths[endpointPath];
    const operation = methodMap.post;
    const operationId = operation.operationId;

    const operationNameWithoutNamespace = operationId.replace(
      new RegExp(`${namespace}_`),
      ""
    );

    if (operationNameWithoutNamespace === "NOOPCodegenAnchor") {
      continue;
    }

    const methodName = `${
      operationNameWithoutNamespace.charAt(0).toLowerCase() +
      operationNameWithoutNamespace.slice(1)
    }`;

    const methodType = methodTypeFromMethodName(methodName);
    const inputType = `T${operationNameWithoutNamespace}Body`;
    const responseType = `T${operationNameWithoutNamespace}Response`;

    if (methodType === "query") {
      codeBuffer.push(
        `\n\t${methodName} = async (input: SdkApiTypes.${inputType}${
          METHODS_WITH_ONLY_OPTIONAL_PARAMETERS.includes(methodName)
            ? " = {}"
            : ""
        }): Promise<SdkApiTypes.${responseType}> => {
    return this.request("${endpointPath}", {
      ...input,
      organizationId: input.organizationId ?? this.config.organizationId
    });
  }`
      );
    } else if (methodType === "command") {
      const unversionedActivityType = `ACTIVITY_TYPE_${operationNameWithoutNamespace
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toUpperCase()}`;
      const versionedActivityType =
        VERSIONED_ACTIVITY_TYPES[unversionedActivityType];

      const resultKey = operationNameWithoutNamespace + "Result";
      const versionedMethodName = latestVersions[resultKey].formattedKeyName;

      codeBuffer.push(
        `\n\t${methodName} = async (input: SdkApiTypes.${inputType}): Promise<SdkApiTypes.${responseType}> => {
    const { organizationId, timestampMs, ...rest } = input;
    return this.command("${endpointPath}", {
      parameters: rest,
      organizationId: organizationId ?? this.config.organizationId,
      timestampMs: timestampMs ?? String(Date.now()),
      type: "${versionedActivityType ?? unversionedActivityType}"
    }, "${versionedMethodName}");
  }`
      );
    } else if (methodType === "activityDecision") {
      codeBuffer.push(
        `\n\t${methodName} = async (input: SdkApiTypes.${inputType}): Promise<SdkApiTypes.${responseType}> => {
    const { organizationId, timestampMs, ...rest } = input;
    return this.activityDecision("${endpointPath}",
      {
        parameters: rest,
        organizationId: organizationId ?? this.config.organizationId,
        timestampMs: timestampMs ?? String(Date.now()),
        type: "ACTIVITY_TYPE_${operationNameWithoutNamespace
          .replace(/([a-z])([A-Z])/g, "$1_$2")
          .toUpperCase()}"
      });
  }`
      );
    }
  }

  // End of the TurnkeySDKClient Class Definition
  codeBuffer.push(`}`);

  await fs.promises.writeFile(
    targetPath,
    [COMMENT_HEADER].concat(imports).concat(codeBuffer).join("\n\n")
  );
};

// Main Runner
main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const swaggerSpecFile = await fs.promises.readFile(
    PUBLIC_API_SWAGGER_PATH,
    "utf-8"
  );
  const swaggerSpec = JSON.parse(swaggerSpecFile);

  await generateApiTypesFromSwagger(swaggerSpec, TARGET_API_TYPES_PATH);
  await generateSDKClientFromSwagger(swaggerSpec, TARGET_SDK_CLIENT_PATH);
}
