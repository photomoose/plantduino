#include "RumrSplashScreen.h"

RumrSplashScreen::RumrSplashScreen(Adafruit_SSD1306* display)
{
  _display = display;
}

void RumrSplashScreen::show(void)
{
  _display->clearDisplay();
  _display->drawBitmap(16, 0, rumrLogo, 96, 32, WHITE);
  _display->display();  
}

