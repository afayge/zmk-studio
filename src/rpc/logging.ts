import { ErrorConditions } from "@zmkfirmware/zmk-studio-ts-client/meta";
import type { Request, RequestResponse } from "./generated/studio";
import {
  call_rpc as inner_call_rpc,
  MetaError,
  RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";

export async function call_rpc(
  conn: RpcConnection,
  req: Omit<Request, "requestId">,
): Promise<RequestResponse> {
  if (!req.lighting?.exchange) console.log("RPC Request", req);
  return inner_call_rpc(conn, req)
    .then((r) => {
      if (!req.lighting?.exchange) console.log("RPC Response", r);
      return r as RequestResponse;
    })
    .catch((e) => {
      if (
        req.lighting &&
        e instanceof MetaError &&
        e.condition === ErrorConditions.UNLOCK_REQUIRED
      )
        throw new Error("Unlock the keyboard to access lighting settings.");
      console.error("RPC Error", e);
      throw e instanceof Error ? e : new Error(String(e));
    });
}
