# MetricsMonitor

FMDX Webserver Monitor plugin for displaying RDS and RF information, volume, equalizers and spectrum analyzer for FM audio, FM baseband and MPX signal.


<img width="1260" height="306" alt="start" src="https://github.com/user-attachments/assets/863202ce-d88d-46c7-9d9f-be3c52b49228" />

## v1.1

- MPX software switching for ESP32 TEF receivers has been added with the new [BETA firmware v2.20.5](https://github.com/Highpoint2000/MetricsMonitor/raw/refs/heads/main/firmware/TEF6686_ESP32_Dev_Beta_%20v2.20.5.zip). Three modes are available (see configuration options!).
- Multiple WebSocket connections revised

## Installation notes

1. [Download](https://github.com/Highpoint2000/MetricsMonitor/releases) the last repository as a zip
2. Unpack all files (MetricsMonitorPlugin.js + MetricsMonitor Folder) to ..fm-dx-webserver-main\plugins\ 
3. Stop or close the fm-dx-webserver
4. Start/Restart the fm-dx-webserver with "npm run webserver / node ." on node.js console, check the console informations
5. Activate the MetricsMonitor plugin in the settings
6. Stop or close the fm-dx-webserver
7. Start/Restart the fm-dx-webserver with "npm run webserver / node ." on node.js console, check the console informations
8. Configure your personal settings in the automatically created metricsmonitor.json (in the folder: ../fm-dx-webserver-main/plugins_configs)
9. Stop or close the fm-dx-webserver
10. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations

## Configuration options

The following variables can be changed in the metricsmonitor.json config file:

    "sampleRate": 48000,          //  Enter the supported sample rate of the input audio card here: 48000 for displaying the FM audio spectrum / 96000 for displaying the FM baseband and 192000 for the MPX spectrum. The default is 48000.
	"fftSize": 512,               //  Here you can change the frequency sampling rate for the spectrum display. The higher the value (e.g., 1024, 2048, 4096), the better the frequency resolution, but also the higher the CPU load. The default is 512.
	"minSendIntervalMs": 30       //  Here you can change the sampling frequency of the audio signal. The higher the frame rate (FPS), the more frequent the sampling and the higher the CPU load. The default is 15.
	"MPXmode: "off"               //  Configure the MPX behavior of the TEF receiver here: "off" = no MPX output / "on" = always MPX output / "auto" = MPX automatic switching (equalizer module in stereo - PILOT/MPX/RDS meter module in mono - spectrum analyzer in mono)
	"SpectrumAverageLevel": 15    //  This variable determines the number of frames from which a smoothed spectrum is averaged from the raw spectrum. The larger the value, the stronger the smoothing; the smaller the value, the faster and less pronounced the smoothing. The default is 15.
    "stereoBoost": 1,             //  If the audio signal is too weak, a gain factor for the audio display can be set here (1 - default).
    "eqBoost": 1,                 //  If the audio signal is too weak, a gain factor for the equalizer display can be set here (1 - default).
    "MODULE_SEQUENCE": "1, 2, 0"  // Here you can set the module display and order: 0 - Audio + Equalizer / 1 - Audio + PILOT/MPX/RDS / 2 - Spectrum Analyzer. Single values ​​or comma-separated values ​​can be entered ("1, 2, 0" - default).

After making changes to the metricsmonitor.json script, the server must be restarted!!!

## Display modes

### Input: 48 kHz Mono/Stereo
<img width="800" height="194" alt="1a" src="https://github.com/user-attachments/assets/51504f0d-2c46-41d4-9f39-2f31b9bfbabb" />

    1 – MO/ST without PILOT/MPX/RDS      2 – only spectrum to 48 kHz          0 – MO/ST with Equalizer
  
### Input: 48 kHz MPX

<img width="800" height="194" alt="2" src="https://github.com/user-attachments/assets/e0d06c50-a484-4cc0-aaa7-7b93ac55e3d4" />

    1 – Mono without PILOT/MPX/RDS    2 – spectrum to 48 kHz with PILOT       0 – Mono with Equalizer

### Input: 96 kHz MPX

<img width="800" height="190" alt="5" src="https://github.com/user-attachments/assets/164aa43a-c2f4-4f4b-8f64-8b72b89d6264" />


       1 – Mono without MPX/RDS       2 – spectrum to 38 kHz with PILOT       0 – Mono with Equalizer

### Input: 192 kHz MPX

<img width="800" height="194" alt="4" src="https://github.com/user-attachments/assets/0f67b21d-2184-47dd-b75e-747f46815a49" />

     1 – Mono with PILOT/MPX/RDS    2 – spectrum to 56 kHz with PILOT/RDS     0 – Mono with Equalizer

## MPX mode

### ESP32 Receiver
Once the PE5PVB firmware is installed, enable the MPX output in the audio settings menu

### Headless TEF
If the Headless TEF has an line audio output, the MPX output can be activated via a jumper on the board

## Important notes

- To activate the audio output and equalizer, press the Play button!
- To avoid distorting the measurement results, the volume control is deactivated after the plugin is installed!
- The function of the modules depends on the sound input and the data rate used:
  0 = 48 kHz signal (mono or stereo) is sufficient.
  1 = Minimum 96 kHz signal is required for the pilot tone display; a 192 kHz signal is required for MPX and RDS display. For both sample rates, the receiver must support MPX output (activate via the menu if necessary).
  2 = 48 kHz displays the FM audio spectrum up to 19 kHz, 96 kHz displays the FM baseband up to 38 kHz, and 192 kHz displays the MPX spectrum up to 56 kHz. For both sample rates (96 + 192 kHz), the receiver must support MPX output (activate via the menu if necessary).
- The configuration file allows individual display modules to be switched on or off and the click sequence to be determined.
- It cannot be guaranteed that the plugin is compatible with all hardware components and platforms.
- The receiver's output volume setting also affects the display behavior and must be taken into account

## Contact

If you have any questions, would like to report problems, or have suggestions for improvement, please feel free to contact me! You can reach me by email at highpoint2000@googlemail.com. I look forward to hearing from you!

<a href="https://www.buymeacoffee.com/Highpoint" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

<details>
<summary>History</summary>

### v1.0a

- Unit of measurement corrected at MPX level
- Variables for individually adjusting the spectrum have been added (see Configuration options)

### v1.0

- Three display modes: Audio + PILOT/MPX/RDS spectrum analysis / Audio + equalizer (Switching is done by clicking on the display)
