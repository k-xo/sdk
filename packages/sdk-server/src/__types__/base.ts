import type { TurnkeyApiTypes } from "@turnkey/http";

export type GrpcStatus = {
  message: string;
  code: number;
  details: unknown[] | null;
};

export enum MethodType {
  Get,
  List,
  Command,
}

export type TStamp = {
  stampHeaderName: string;
  stampHeaderValue: string;
};

export interface TStamper {
  stamp: (input: string) => Promise<TStamp>;
}

export type THttpConfig = {
  baseUrl: string;
};

export type TActivityPollerConfig = {
  intervalMs: number;
  numRetries: number;
};

export class TurnkeyRequestError extends Error {
  details: any[] | null;
  code: number;

  constructor(input: GrpcStatus) {
    let turnkeyErrorMessage = `Turnkey error ${input.code}: ${input.message}`;

    if (input.details != null) {
      turnkeyErrorMessage += ` (Details: ${JSON.stringify(input.details)})`;
    }

    super(turnkeyErrorMessage);

    this.name = "TurnkeyRequestError";
    this.details = input.details ?? null;
    this.code = input.code;
  }
}

export interface ActivityResponse {
  activity: {
    id: string;
    status: string;
    result: Record<string, any>;
  };
}

export interface ActivityMetadata {
  activity: {
    id: string;
    status: string;
  };
}

export type queryOverrideParams = {
  organizationId?: string;
};

export type commandOverrideParams = {
  organizationId?: string;
  timestampMs?: string;
};

export interface TurnkeySDKClientConfig {
  stamper: TStamper;
  apiBaseUrl: string;
  organizationId: string;
  activityPoller?: TActivityPollerConfig | undefined;
}

export interface TurnkeySDKServerConfig {
  apiBaseUrl: string;
  apiPrivateKey: string;
  apiPublicKey: string;
  defaultOrganizationId: string;
  activityPoller?: TActivityPollerConfig | undefined;
}

export interface TurnkeyProxyHandlerConfig {
  allowedMethods?: string[];
}

export const TERMINAL_ACTIVITY_STATUSES: TurnkeyApiTypes["v1ActivityStatus"][] =
  [
    "ACTIVITY_STATUS_COMPLETED",
    "ACTIVITY_STATUS_FAILED",
    "ACTIVITY_STATUS_REJECTED",
  ];

export type TActivityStatus = TurnkeyApiTypes["v1ActivityStatus"];

export interface NextApiRequest {
  body: any;
  query: { [key: string]: string };
}

export interface NextApiResponse<T = any> {
  status: (statusCode: number) => NextApiResponse<T>;
  json: (data: T) => void;
  send: (data: any) => void;
}

export type NextApiHandler = (
  req: NextApiRequest,
  res: NextApiResponse
) => void | Promise<void>;

export interface ApiCredentials {
  apiPublicKey: string;
  apiPrivateKey: string;
}
