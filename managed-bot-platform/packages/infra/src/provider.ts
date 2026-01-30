export interface CreateInstanceParams {
  botId: string;
  region: string;
  size: string;
  userData: string;
  tags: string[];
}

export interface ProviderResourceIds {
  instanceId: string;
  volumeId: string | null;
  ipAddress: string | null;
}

export interface AttachVolumeParams {
  instanceId: string;
  volumeId: string;
  botId: string;
  region: string;
  sizeGb: number;
}

export interface FirewallParams {
  botId: string;
  instanceId: string;
  allowedInboundIps: string[];
}

export interface BootstrapParams {
  instanceId: string;
  userData: string;
}

export type InstanceStatus =
  | "creating"
  | "active"
  | "off"
  | "archive"
  | "not_found"
  | "error";

export interface ComputeProvider {
  readonly name: string;

  createInstance(params: CreateInstanceParams): Promise<ProviderResourceIds>;

  attachVolume(params: AttachVolumeParams): Promise<{ volumeId: string }>;

  configureFirewall(params: FirewallParams): Promise<void>;

  injectBootstrap(params: BootstrapParams): Promise<void>;

  destroyInstance(instanceId: string): Promise<void>;

  destroyVolume(volumeId: string): Promise<void>;

  getInstanceStatus(instanceId: string): Promise<InstanceStatus>;
}
