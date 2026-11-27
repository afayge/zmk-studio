// Use the extended Studio envelopes on the standard USB/BLE framing layer.
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import {
  get_decoder,
  get_encoder,
} from "@zmkfirmware/zmk-studio-ts-client/framing";
import {
  Notification,
  Request,
  RequestResponse,
  Response,
} from "./generated/studio";

export function createStudioConnection(
  transport: RpcTransport,
  signal: AbortSignal,
): RpcConnection {
  const requests = new TransformStream<Request, Uint8Array>({
    transform(request, controller) {
      controller.enqueue(Request.encode(request).finish());
    },
  });
  void requests.readable
    .pipeThrough(new TransformStream(get_encoder()), { signal })
    .pipeTo(transport.writable, { signal })
    .then(
      () => transport.abortController.abort(),
      (reason) => transport.abortController.abort(reason),
    );

  const incoming = transport.readable
    .pipeThrough(new TransformStream(get_decoder()), { signal })
    .pipeThrough(
      new TransformStream<Uint8Array, Response>({
        transform(bytes, controller) {
          controller.enqueue(Response.decode(bytes));
        },
      }),
      { signal },
    );
  const [replies, notices] = incoming.tee();
  return {
    label: transport.label,
    current_request: 0,
    request_writable: requests.writable,
    request_response_readable: replies.pipeThrough(
      new TransformStream<Response, RequestResponse>({
        transform(message, controller) {
          if (message.requestResponse)
            controller.enqueue(message.requestResponse);
        },
      }),
      { signal },
    ),
    notification_readable: notices.pipeThrough(
      new TransformStream<Response, Notification>({
        transform(message, controller) {
          if (message.notification) controller.enqueue(message.notification);
        },
      }),
      { signal },
    ),
  };
}
