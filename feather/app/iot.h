// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

#ifndef SIMPLESAMPLEMQTT_H
#define SIMPLESAMPLEMQTT_H

#ifdef __cplusplus
extern "C" {
#endif

    void iot_sendTelemetry(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle, float tempCInside, float tempCOutside);
    void iot_doWork(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle);
    IOTHUB_CLIENT_LL_HANDLE iot_init();

#ifdef __cplusplus
}
#endif

#endif /* SIMPLESAMPLEMQTT_H */
