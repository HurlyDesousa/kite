export type Note = {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
  reply: boolean;
  local?: boolean;
};

export type RelayState = {
  url: string;
  live: boolean;
  lastEventAt?: number;
};

export type Profile = {
  name?: string;
  displayName?: string;
};
