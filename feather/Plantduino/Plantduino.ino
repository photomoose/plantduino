#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_GFX.h> 
#include <Adafruit_SSD1306.h>
#include "RumrSplashScreen.h"

#define OLED_RESET 4
DeviceAddress inDSAddr  = { 0x28, 0xFF, 0x92, 0x59, 0x70, 0x14, 0x04, 0x6E };
DeviceAddress outDSAddr = { 0x28, 0xFF, 0x97, 0x75, 0x70, 0x14, 0x04, 0xDE };


Adafruit_SSD1306 display(OLED_RESET);
RumrSplashScreen splash(&display);
OneWire oneWire(5);
DallasTemperature ds(&oneWire);
  
void setup() {
  Serial.begin(9600);
//  while (!Serial) {
//  }

  display.begin();
  splash.show();
  delay(3000);
  
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(WHITE);

  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);

  
  ds.begin();
}

void loop() {
  ds.requestTemperatures();

  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Out: ");
  display.println(ds.getTempC(outDSAddr));
  display.print("In:  ");
  display.println(ds.getTempC(inDSAddr)); 
  display.display();

  delay(1000);
}
