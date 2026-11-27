#!/bin/sh
# Regenerate the Studio envelopes and extended subsystem codecs from the firmware checkout.
set -eu
firmware=${1:-"$HOME/zmk"}
local_schema="$firmware/app/src/studio/proto"
upstream="$firmware/modules/msgs/zmk-studio-messages/proto/zmk"
# Run from the Studio project root with protoc and ts-proto 1.181.2 on PATH.
protoc -I "$local_schema" -I "$upstream" --ts_proto_out=src/rpc/generated \
  --ts_proto_opt=env=browser,outputJsonMethods=false,outputPartialMethods=false,esModuleInterop=true \
  --ts_proto_opt=Mmeta.proto=@zmkfirmware/zmk-studio-ts-client/meta \
  "$local_schema/behaviors.proto" "$local_schema/keymap.proto" "$local_schema/core.proto" "$local_schema/lighting.proto" "$local_schema/studio.proto"
