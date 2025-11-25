# MetricsMonitor

FMDX Webserver Monitor plugin for displaying RDS and RF information, volume, equalizers and spectrum analyzer for FM audio, FM baseband and MPX signal.


<img width="1228" height="293" alt="image" src="https://github.com/user-attachments/assets/3782fefd-01e5-474a-bcd5-c4b1fc6d7be9" />

## v1.0

- Three display modes: Audio + PILOT/MPX/RDS spectrum analysis / Audio + equalizer (Switching is done by clicking on the display)

## Installation notes:

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

## Configuration options:

The following variables can be changed in the metricsmonitor.json config file:

    "sampleRate": 48000,          //  Enter the supported sample rate of the input audio card here: 48000 for displaying the FM audio spectrum / 96000 for displaying the FM baseband and 192000 for the MPX spectrum. The default is 48000.
    "stereoBoost": 1,             //  If the audio signal is too weak, a gain factor for the audio display can be set here (1 - default).
    "eqBoost": 1,                 //  If the audio signal is too weak, a gain factor for the equalizer display can be set here (1 - default).
    "MODULE_SEQUENCE": "1, 2, 0"  // Here you can set the module display and order: 0 - Audio + Equalizer / 1 - Audio + PILOT/MPX/RDS / 2 - Spectrum Analyzer. Single values ​​or comma-separated values ​​can be entered ("1, 2, 0" - default).

After making changes to the metricsmonitor.json script, the server must be restarted!!!

## Important notes: 

- The function of the modules depends on the sound input and the data rate used:
  0 = 48 kHz signal (mono or stereo) is sufficient.
  1 = Minimum 96 kHz signal is required for the pilot tone display; a 192 kHz signal is required for MPX and RDS display. For both sample rates, the receiver must support MPX output (activate via the menu if necessary).
  2 = 48 kHz displays the FM audio spectrum up to 19 kHz, 96 kHz displays the FM baseband up to 38 kHz, and 192 kHz displays the MPX spectrum up to 56 kHz. For both sample rates (96 + 192 kHz), the receiver must support MPX output (activate via the menu if necessary).
- The configuration file allows individual display modules to be switched on or off and the click sequence to be determined.
- It cannot be guaranteed that the plugin is compatible with all hardware components and platforms.
- The receiver's output volume setting also affects the display behavior and must be taken into account.

## Contact

If you have any questions, would like to report problems, or have suggestions for improvement, please feel free to contact me! You can reach me by email at highpoint2000@googlemail.com. I look forward to hearing from you!

<a href="https://www.buymeacoffee.com/Highpoint" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

<details>
<summary>History</summary>
