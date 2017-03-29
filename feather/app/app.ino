// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.


// Use Arduino IDE 1.6.8 or later.

#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include <time.h>
#include <sys/time.h>
#include <SPI.h>

// for Adafruit WINC1500
#include <Adafruit_WINC1500.h>
#include <Adafruit_WINC1500SSLClient.h>
#include <Adafruit_WINC1500Udp.h>
#include <NTPClient.h>

#include <OneWire.h>
#include <DallasTemperature.h>

#include <Adafruit_GFX.h> 
#include <Adafruit_SSD1306.h>

#define OLED_RESET  4

#define DS_DQ       5

// Setup the WINC1500 connection
#define WINC_CS   8
#define WINC_IRQ  7
#define WINC_RST  4
#define WINC_EN   2     
Adafruit_WINC1500 WiFi(WINC_CS, WINC_IRQ, WINC_RST);

#include <AzureIoTHub.h>
#include <AzureIoTUtility.h>
#include <AzureIoTProtocol_MQTT.h>

#include "RumrSplashScreen.h"
#include "config.h"
#include "iot.h"

static Adafruit_WINC1500SSLClient sslClient; // for Adafruit WINC1500

DeviceAddress inDSAddr  = { 0x28, 0xFF, 0x92, 0x59, 0x70, 0x14, 0x04, 0x6E };
DeviceAddress outDSAddr = { 0x28, 0xFF, 0x97, 0x75, 0x70, 0x14, 0x04, 0xDE };

Adafruit_SSD1306 display(OLED_RESET);
RumrSplashScreen splash(&display);

OneWire oneWire(DS_DQ);
DallasTemperature ds(&oneWire);

static AzureIoTHubClient iotHubClient;
IOTHUB_CLIENT_LL_HANDLE iotHubClientHandle;


void setup() {
    initSplashScreen();
    initSerial();
    initWifi();
    initTime();
    initTempSensors();

    iotHubClient.begin(sslClient);
    iotHubClientHandle = iot_init();
}

void loop() {
    
    ds.requestTemperatures();

  float tempCInside = ds.getTempC(inDSAddr);
  float tempCOutside = ds.getTempC(outDSAddr);
    
  iot_sendTelemetry(iotHubClientHandle, tempCInside, tempCOutside);

  iot_doWork(iotHubClientHandle); 

  delay(1000);
}

void initTempSensors() {
    ds.begin();
}

void initSplashScreen() {
  display.begin();
  splash.show();

  delay(3000);    
}

void initSerial() {
    // Start serial and initialize stdout
    Serial.begin(115200);

  while (!Serial) {
    ; // wait for serial port to connect. Needed for native USB port only
  }    
}

void initWifi() {
    // for the Adafruit WINC1500 we need to enable the chip
    pinMode(WINC_EN, OUTPUT);
    digitalWrite(WINC_EN, HIGH);

    // check for the presence of the shield :
    if (WiFi.status() == WL_NO_SHIELD) {
        Serial.println("WiFi shield not present");
        // don't continue:
        while (true);
    }

    // attempt to connect to Wifi network:
    Serial.print("Attempting to connect to SSID: ");
    Serial.println(ssid);

    // Connect to WPA/WPA2 network. Change this line if using open or WEP network:
    while (WiFi.begin(ssid, pass) != WL_CONNECTED) {
        // unsuccessful, retry in 4 seconds
        Serial.print("failed ... ");
        delay(4000);
        Serial.print("retrying ... ");
    }

    Serial.println("Connected to wifi");
}

void initTime() {
    Adafruit_WINC1500UDP ntpUdp; // for Adafruit WINC1500

    NTPClient ntpClient(ntpUdp);

    ntpClient.begin();

    while (!ntpClient.update()) {
        Serial.println("Fetching NTP epoch time failed! Waiting 5 seconds to retry.");
        delay(5000);
    }

    ntpClient.end();

    unsigned long epochTime = ntpClient.getEpochTime();

    Serial.print("Fetched NTP epoch time is: ");
    Serial.println(epochTime);

    iotHubClient.setEpochTime(epochTime);
}
