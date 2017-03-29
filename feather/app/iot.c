// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

#include <stdlib.h>

#include <stdio.h>
#include <stdint.h>

/* This sample uses the _LL APIs of iothub_client for example purposes.
That does not mean that MQTT only works with the _LL APIs.
Simply changing the using the convenience layer (functions not having _LL)
and removing calls to _DoWork will yield the same results. */

#ifdef ARDUINO
#include "AzureIoTHub.h"
#else
#include "azure_c_shared_utility/threadapi.h"
#include "azure_c_shared_utility/platform.h"
#include "serializer.h"
#include "iothub_client_ll.h"
#include "iothubtransportmqtt.h"
#endif

#ifdef MBED_BUILD_TIMESTAMP
#include "certs.h"
#endif // MBED_BUILD_TIMESTAMP


/*String containing Hostname, Device Id & Device Key in the format:             */
/*  "HostName=<host_name>;DeviceId=<device_id>;SharedAccessKey=<device_key>"    */
static const char* connectionString = "HostName=plantduino.azure-devices.net;DeviceId=feather;SharedAccessKey=Pf02GG6uLHefWnts8p94MwQP0vAXI2Pf3YxjFtSg7XA=";

// Define the Model
BEGIN_NAMESPACE(Rumr);

DECLARE_MODEL(Plantduino,
WITH_DATA(ascii_char_ptr, DeviceId),
WITH_DATA(float, TempCInside),
WITH_DATA(float, TempCOutside),
WITH_ACTION(TurnWaterOn, int, DurationSecs)
);

END_NAMESPACE(Rumr);

EXECUTE_COMMAND_RESULT TurnWaterOn(Plantduino* device, int DurationSecs)
{
    (void)device;
    (void)printf("Turning water on for %d seconds.\r\n", DurationSecs);
    return EXECUTE_COMMAND_SUCCESS;
}

void sendCallback(IOTHUB_CLIENT_CONFIRMATION_RESULT result, void* userContextCallback)
{
    unsigned int messageTrackingId = (unsigned int)(uintptr_t)userContextCallback;

    (void)printf("Message Id: %u Received.\r\n", messageTrackingId);

    (void)printf("Result Call Back Called! Result is: %s \r\n", ENUM_TO_STRING(IOTHUB_CLIENT_CONFIRMATION_RESULT, result));
}

static void sendMessage(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle, const unsigned char* buffer, size_t size)
{
    static unsigned int messageTrackingId;
    IOTHUB_MESSAGE_HANDLE messageHandle = IoTHubMessage_CreateFromByteArray(buffer, size);
    if (messageHandle == NULL)
    {
        printf("unable to create a new IoTHubMessage\r\n");
    }
    else
    {
        if (IoTHubClient_LL_SendEventAsync(iotHubClientHandle, messageHandle, sendCallback, (void*)(uintptr_t)messageTrackingId) != IOTHUB_CLIENT_OK)
        {
            printf("failed to hand over the message to IoTHubClient");
        }
        else
        {
            printf("IoTHubClient accepted the message for delivery\r\n");
        }
        IoTHubMessage_Destroy(messageHandle);
    }
    free((void*)buffer);
    messageTrackingId++;
}

/*this function "links" IoTHub to the serialization library*/
static IOTHUBMESSAGE_DISPOSITION_RESULT IoTHubMessage(IOTHUB_MESSAGE_HANDLE message, void* userContextCallback)
{
    printf("Received message\r\n");
    
    IOTHUBMESSAGE_DISPOSITION_RESULT result;
    const unsigned char* buffer;
    size_t size;
    if (IoTHubMessage_GetByteArray(message, &buffer, &size) != IOTHUB_MESSAGE_OK)
    {
        printf("unable to IoTHubMessage_GetByteArray\r\n");
        result = EXECUTE_COMMAND_ERROR;
    }
    else
    {
        /*buffer is not zero terminated*/
        char* temp = malloc(size + 1);
        if (temp == NULL)
        {
            printf("failed to malloc\r\n");
            result = EXECUTE_COMMAND_ERROR;
        }
        else
        {
            memcpy(temp, buffer, size);
            temp[size] = '\0';
            EXECUTE_COMMAND_RESULT executeCommandResult = EXECUTE_COMMAND(userContextCallback, temp);
            result =
                (executeCommandResult == EXECUTE_COMMAND_ERROR) ? IOTHUBMESSAGE_ABANDONED :
                (executeCommandResult == EXECUTE_COMMAND_SUCCESS) ? IOTHUBMESSAGE_ACCEPTED :
                IOTHUBMESSAGE_REJECTED;
            free(temp);
        }
    }
    return result;
}

void iot_doWork(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle)
{
  printf("Client doing work\r\n");
  IoTHubClient_LL_DoWork(iotHubClientHandle); 
}

IOTHUB_CLIENT_LL_HANDLE iot_init()
{
    if (platform_init() != 0)
    {
        (void)printf("Failed to initialize platform.\r\n");
        return NULL;
    } 

    if (serializer_init(NULL) != SERIALIZER_OK)
    {
        (void)printf("Failed on serializer_init\r\n");
        return NULL;
    }   

    IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle = IoTHubClient_LL_CreateFromConnectionString(connectionString, MQTT_Protocol);
    
    Plantduino* telemetry = CREATE_MODEL_INSTANCE(Rumr, Plantduino);
    
    if (IoTHubClient_LL_SetMessageCallback(iotHubClientHandle, IoTHubMessage, telemetry) != IOTHUB_CLIENT_OK)
    {
        printf("Failed to set message callback\r\n");
        
    }
      
    return iotHubClientHandle;
}

void iot_deinit(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle)
{
  IoTHubClient_LL_Destroy(iotHubClientHandle);

  serializer_deinit();

  platform_deinit();
}

void iot_sendTelemetry(IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle, float tempCInside, float tempCOutside)
{
  Plantduino* telemetry = CREATE_MODEL_INSTANCE(Rumr, Plantduino);
  if (telemetry == NULL)
  {
      (void)printf("Failed to create Plantduino model\r\n");
  }
  else
  {
    telemetry->DeviceId = "myFirstDevice";
    telemetry->TempCInside = tempCInside;
    telemetry->TempCOutside = tempCOutside;
    
    unsigned char* destination;
    size_t destinationSize;
    
    if (SERIALIZE(&destination, &destinationSize, telemetry->DeviceId, telemetry->TempCInside, telemetry->TempCOutside) != CODEFIRST_OK)
    {
        (void)printf("Failed to serialize Plantduino model\r\n");
    }
    else
    {
        IOTHUB_MESSAGE_HANDLE messageHandle = IoTHubMessage_CreateFromByteArray(destination, destinationSize);
        if (messageHandle == NULL)
        {
            printf("unable to create a new IoTHubMessage\r\n");
        }
        else
        {
            if (IoTHubClient_LL_SendEventAsync(iotHubClientHandle, messageHandle, sendCallback, (void*)1) != IOTHUB_CLIENT_OK)
            {
                printf("Failed to send message to IoTHubClient");
            }
            else
            {
                printf("IoTHubClient accepted the message for delivery\r\n");
            }

            IoTHubMessage_Destroy(messageHandle);
        }
        free(destination);
    }

    DESTROY_MODEL_INSTANCE(telemetry);
  }      
}
