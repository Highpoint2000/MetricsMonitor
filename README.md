# MetricsMonitor

FMDX Webserver Monitor plugin for displaying RDS and RF information, volume, equalizers, spectrum analyzer and oscilloscope for FM audio, FM baseband and MPX signal.

<img width="1211" height="842" alt="Screenshot 2026-04-14 233011" src="https://github.com/user-attachments/assets/ab4b3ca8-271c-4498-bb53-311e68477b1a" />



## v2.8b

- Auto-Patcher has been enhanced to prevent spam classifications for the local IP address (127.0.0.1), including in new web server versions from 1.4.1 onwards.

You can find the current manual here:
https://highpoint.fmdx.org/manuals/MetricsMonitor-Documentation.html

## Important note for this version: 

To use the MPX switching option with an ESP32 TEF receiver, this firmware version must be installed:
https://github.com/Highpoint2000/MetricsMonitor/raw/refs/heads/main/firmware/TEF6686_ESP32_Dev_Beta_%20v2.20.6.zip

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

## How do I calibrate the meter display?

1. Adjust the input value if necessary:

   - If the Pilot, MPX, and RDS meters show no signal level, increase the MeterInputCalibration in increments of 5
   - If the meters are in the red zone, decrease the MeterInputCalibration in increments of 5

2. Roughly adjust the meter readings (once via Scale):

   - MeterPilotScale: Adjust this up/down (100/50er steps) until you reach approximately 7 kHz.
   - MeterMPXScale: Adjust this up/down (100/50er steps) until you reach approximately 75 kHz.
   - MeterRDSScale: Adjust this up/down (100/50er steps)until you reach approximately 2.0 kHz.	
   
   Now you can use the calibration tool to calculate the exact scale values ​​so that the calibration values ​​remain at 0 (Step 3 - Fine-tuning is therefore omitted!):
   https://highpoint.fmdx.org/webtools/MetricsMonitorCalibrationTool.html  
   
3. Alternatively: Manual fine-tuning:

   - MeterPilotCalibration Display: 7.2 kHz. Target: 6.7 kHz. -> MeterPilotCalibration: -0.5
   - MeterMPXCalibration Display: 78.2 kHz MPX. Target: 78.0 kHz. -> MeterMPXCalibration: -0.2
   - MeterRDSCalibration Display: 2.5 kHz RDS. Target: 2.0 kHz. -> MeterRDSCalibration: -0.5
   
   Note: The calibration variables should only be used for direct fine-tuning in the decimal range (0.x), as otherwise they will distort the measurement result. Ideally, they should be reset to 0 later using the Metrics Monitor Calibration Tool.


## Configuration options

The following variables can be changed in the metricsmonitor.json config file:

    /* Audio & MPX Hardware Settings */	
    "sampleRate": 48000,             //  Enter the supported sample rate of the input audio card here: 48000 for displaying the FM audio spectrum / 96000 for displaying the FM baseband and 192000 for the MPX spectrum. The default is 48000.
    "MPXmode": "off",                //  Configure the MPX behavior of the TEF receiver here: "off" = no MPX output / "on" = always MPX output / "auto" = MPX automatic switching (equalizer and signal meter module in stereo - PILOT/MPX/RDS meter module in mono - spectrum analyzer in mono)
	"MPXChannel": "auto",            //  Set the fixed channel for the MPX signal here if necessary ("left" or "right", "auto" is default)
    "MPXStereoDecoder": "off",	     //  Set the switch to "on" if you are decoding the stereo signal from MPX with a stereo decoder. This will enable the optical mono/stereo indicator to function when MPXmode is set to "on". The default setting is "off".          
    "MPXInputCard": "",              //  Configure the sound input exclusive to MPX (e.g., for Linux: "plughw:CARD=Device" or Windows: "Microphone (HD USB Audio Device)")
    "MPXTiltCalibration": 0,         //  Adjust the input slope of the sound card from -1000 µs to 1000 µs (default is 0)
	"VisualDelayMs": 250,            //  Set the client-side delay in milliseconds for the analyzer, scope, and MPX display here so that it runs in sync with the audio playback (default is 250).
	
    /* Calibration Offsets (Meters) */
    "MeterInputCalibration": 0,      //  Increase or decrease the value as needed to adjust the input for the MPX gauges (Pilot, MPX, RDS). The default value is 0. 
    "MeterPilotCalibration": 0,      //  Calibrate the +/- level value for the Pilot level indicator (default = 0)
    "MeterMPXCalibration": 0,        //  Calibrate the +/- level value for the MPX level indicator (default = 0)
    "MeterRDSCalibration": 0,        //  Calibrate the +/- level value for the RDS level indicator (default = 0)

    /* Meter Scales */
    "MeterPilotScale": 400,          // Scale factor for Pilot deviation (default is 400)
    "MeterMPXScale": 100,            // Scale factor for MPX deviation (default is 100)
    "MeterRDSScale": 750,            // Scale factor for RDS deviation (default is 750)

    /* FFT / Spectrum Settings */
	"fftSize": 512,                  //  Change the frequency sampling rate for the spectrum display. The higher the value (e.g. 1024, 2048, 4096), the better the frequency resolution, but also the higher the CPU load. The default and minimum value is 512.

    /* Spectrum & Scope Visuals */
    "SpectrumInputCalibration": 0,   //  Increase or decrease the value as needed to adjust the input for the spectrum. The default value is 0. 
	"SpectrumAttackLevel": 3,        //  Response rate of the spectrum display as the signal increases. The default value is 3.
    "SpectrumDecayLevel": 15;        //  This variable determines the number of frames from which a smoothed spectrum is averaged from the raw spectrum. The larger the value, the stronger the smoothing; the smaller the value, the faster and less pronounced the smoothing. The default is 15.
	"SpectrumSendInterval": 30,      //  Change the sampling frequency of the audio signal. The higher the frame rate (FPS), the more frequent the sampling and the higher the CPU load. The default is 15.
    "SpectrumYOffset": -40,          //  Set the +/- level value for the analyzing curve offset (default = -40)
    "SpectrumYDynamics": 2,          //  Set the +/- level value for the analyzing curve dynamic (peak indication / default = 2)
	"ScopeInputCalibration": 0,      //  Increase or decrease the value as needed to adjust the input for the scope. The default value is 0. 

    /* Meter Gains */
	"StereoBoost": 2,                //  If the audio signal is too weak, a gain factor for the audio display can be set here (2 - default).
    "AudioMeterBoost": 1,            //  If the audio signal is too weak, a gain factor for the equalizer display can be set here (1 - default).

    /* Layout & UI */
    "MODULE_SEQUENCE": "1,2,5,0,3,4",  //  Set the module display and order: 0 - Audio + Equalizer / 1 - Audio + PILOT/MPX/RDS / 2 - Spectrum Analyzer / 5 - Oscilloscope - Waveform / 3 - Audio + Signal Strength / 4 - Signal Analyzer. Single values ​​or comma-separated values ​​can be entered: "0,4" or "4" etc. ("1,2,5,0,3,4" - default).
	"CANVAS_SEQUENCE": "2,5,4",        //  Set the module display and order: 2 - PILOT/MPX/RDS + Spectrum Analyzer / 5 - PILOT/MPX/RDS + Oscilloscope - Waveform / 4 - Signal Strength + Signal Analyzer. Single values ​​or comma-separated values ​​can be entered: "2,4", "4,2", "4" or "2". ("2,4" - default). An empty field hides the MPX/Signal button.
    "MultipathMode": 0,                //  Set to 1 if using a TEF radio (TEF Radio smooth) or 0 if using a TEF module (Raw MP Data). Based on the assumption TEF radio MP peaks around 40%.
    "LockVolumeSlider": true,          //  The locked volume control in the browser can be unlocked if needed, but this will affect the measured values ​​(default is true).
	"EnableSpectrumOnLoad": false,     //  Set to true for automatic startup activation for the Spectrum Graph plugin (default is false).
    "EnableAnalyzerAdminMode": false,  //  Set to true to restricts analyzer/oscilloscope display to administrators (default ist false).

    /* Colors & Peaks */
    "MeterColorSafe": "rgb(0, 255, 0)";       // Change the color here for the safe range of the meter displays. The default is "rgb(0, 255, 0)".
    "MeterColorWarning": "rgb(255, 255,0)";   // Change the color here for the warning range of the meter displays. The default is "rgb(255, 255, 0)".
    "MeterColorDanger": "rgb(255, 0, 0)";     // Change the color here for the danger range of the meter displays. The default is "rgb(255, 0, 0)".
    "PeakMode": "dynamic";                    // To set a custom color for the highest peak, change the setting to "fixed". The default is "dynamic".
    "PeakColorFixed": "rgb(251, 174, 38)";    // Define a custom color here for the highest peak display. The default is "rgb(251, 174, 38)".

After making changes to the metricsmonitor.json script, a server restart is only necessary for selected settings; a browser reload may also be sufficient!


## Module Displays (Values ​​for MODULE_SEQUENCE)
<img width="1588" height="225" alt="grafik" src="https://github.com/user-attachments/assets/3c0f23e7-454d-4ef6-844e-9d93960e1e85" />

## Canvas Displays (Values ​​for CANVAS_SEQUENCE)
<img width="1637" height="304" alt="grafik" src="https://github.com/user-attachments/assets/71c88160-344c-4d65-be12-8a8dc74925d1" />
<img width="1220" height="231" alt="grafik" src="https://github.com/user-attachments/assets/6404eff5-3acf-4c64-ae8f-7c3ce9175424" />
<img width="1220" height="362" alt="Screenshot 2026-04-14 233424" src="https://github.com/user-attachments/assets/3bc8f892-7f50-4dae-b221-dded75f0871f" />



## MPX Equipment

### ESP32 Receiver
Make sure the correct PE5PVB firmware is installed. You can either use the software-based MPX switching ("MPXmode": "auto" or "on") or you can permanently activate the MPX output in the audio settings menu. MPX software switching for ESP32 TEF receivers has been added with the new [BETA firmware v2.20.5](https://github.com/Highpoint2000/MetricsMonitor/raw/refs/heads/main/firmware/TEF6686_ESP32_Dev_Beta_%20v2.20.5.zip). Three modes are available (see configuration options!)

### Headless TEF
If the Headless TEF has a line-level audio output, the MPX output can be permanently enabled via a jumper on the board. It is recommended to output the signal to a 192kHz compatible sound card, which is then configured as "MPXInputCard": "plughw:CARD=Device" (Linux) or : "Microphone (HD USB Audio Device)" (Windows). Normal mono/stereo sound output continues to be handled by the i2s USB sound interface.

### MPX Tool & Co.
Anyone wishing to perform stereo decoding using MPX Tool or similar should use the settings "MPXmode": "on" and "MPXStereoDecoder": "on". This will result in permanent MPX output and stereo signaling on the display.

## Hardware Configuration Recommendations

<img width="320" height="240" alt="Folie1" src="https://github.com/user-attachments/assets/8b9bbe20-3d28-49be-bca0-2f4ac9153915" />
<img width="320" height="240" src="https://github.com/user-attachments/assets/429c8fb2-43ee-4eb1-ae98-06eae1dd0b6f" />
<img width="320" height="240" src="https://github.com/user-attachments/assets/3cdebe6a-6eb6-4f7f-b7ad-364853d55f26" />

You can test the plugin here:

Option 1 - http://highpoint2000.selfhost.de:6080

Option 3 - http://highpoint2000.selfhost.de:8080 
           https://highpoint.fmtuner.org

## Important notes

- Press the play button to activate the audio output and equalizer.
- You can quickly switch between modules using the numeric keys. Which numbers are active depends on the number of activated modules. The counting always starts with the first value.
- To avoid distorting the measurement results, the volume control is disabled after the plugin is installed! You can re-enable it via the configuration if needed.
- The function of the modules depends on the input signal and the data rate used:
  0/3 = 48 kHz signal (mono or stereo) is sufficient.
  1 = Signal of at least 96 kHz is required for the pilot tone display; a 192 kHz signal is required for the MPX and RDS displays. For both sampling rates, the receiver must support MPX output (activate via the menu if necessary).
  2 = 48 kHz displays the FM audio spectrum up to 19 kHz, 96 kHz the FM baseband up to 38 kHz, and 192 kHz the MPX spectrum up to 56 kHz. For both sampling rates (96 and 192 kHz), the receiver must support MPX output (activate this via the menu or configuration if necessary).
- The configuration file allows you to switch individual display modules on and off and define the click sequence. The various displays can also be calibrated there.
- Press the CTRL key to select different zoom options in MPX + Signal analysis modes
- Due to the high data rate (up to 10 Mbit/s) and CPU load, it is recommended to restrict the display of the MPX Spectrum (Analyzer) and the Oscilloscope to the administrator account -> "EnableAnalyzerAdminMode": true

Compatibility with all hardware components and platforms cannot be guaranteed. The receiver's output volume, as well as the technical characteristics of the hardware components, affect the display behavior and must be taken into account!!!

## Contact

If you have any questions, would like to report problems, or have suggestions for improvement, please feel free to contact me! You can reach me by email at highpoint2000@googlemail.com. I look forward to hearing from you!

<a href="https://www.buymeacoffee.com/Highpoint" target="_blank"><img src="https://tef.noobish.eu/logos/images/buymeacoffee/default-yellow.png" alt="Buy Me A Coffee" ></a>

<details>
<summary>History</summary>

### v2.8a

- Shared hub: shared WebSocket hub, all three client modules delegate to window.MetricsMpxHub, one connection instead of three (reduce network bandwidth usage)
- IdleShutdown: config option to end MPXCapture binary when idle, with heartbeat tracking, debounced SIGTERM, restart on demand, correct Linux process group kill

Many thanks to AmateurAudioDude for these code adjustments!

### v2.8

- Added a new switchable waveform display for the oscilloscope mode 
- Revised the waveform display for the spectrum analyz

### v2.7

- RF and MP meter displays have been replaced by ACI and CCI in signal meter module 3. The calculation basis comes from https://github.com/R100DX/SignalGuard (Thanks to mateusz100)
- Added a new graphical display of signal value, MP, ACI and CCI to the Canavas Signal Plot Display (Thanks to GOR for the template and inspiration)
- The 5-band audiometer corrects the treatment of signals with different phases

### v2.6

- Added dBr power display to the Canvas Scope display (thanks to Bojcha for the code)
- Added CRT monitor effect to the Scope Monitor
- Removed ghost peak display from the VU meter
- Fixed a bug when switching modules in the VU meter display with the Canvas Scope Monitor enabled

### v2.5a

- Peak display in the 5-band audiometer corrected for the "fixed" setting
- Fixed a bug in the spectrum/scope display in the module display when Canvas was started
- Revised scope update rate


### v2.5

- Numeric and meter display for multipath value built into signalmeter modul (code for calculation comes from the UIAddonPack plugin by AmateurAudioDude)
- MultipathMode Variable added to adjust the multipath measurement value (see configuration options!)

### v2.4b

- Patch against spamming detection updated
- 5-band audiometer and VU meter adjusted
- Fixed memory overflow issue

### v2.4a
- New variable ScopeInputCalibration added for calibrating the oscilloscope (see configuration options!)
- The frame rate of the oscilloscope was significantly increased
- Bandwidth of the 5-band audiometer adjusted
- MPXcapture optimized for Linux

### v2.4
- Vertical marker lines at 16, 22, 54 and 60 kHz were added to the analyzer
- 5-band audio display calibrated and adjusted
- VU meter calibrated and adjusted
- Fixed duplicate tooltip display on multipath icon
- RF level meter now matches module 3
- Tilt correction improved (thanks to AmateurAudioDude for the code)
- Variable built in for delaying the analyzer, scope, and MPX output (see Configuration options) -> necessary for client-side audio synchronization

### v2.3d
- Channel selection added for the MPX signal (left, right or auto)

### v2.3c
- Alignment of scale values ​​adjusted
- Remove duplicate peak displays

### v2.3b
- Oscilloscope and spectrum analyzer treated separately for resource reasons -> reduction of CPU and network load

### v2.3a
- Access rights to MPXCapture under Linux are granted automatically
- VU meter display now also starts with "MODULE_SEQUENCE": "1",
- Frequency display at cursor line in spectrum corrected

### v2.3
- Oscilloscope now has its own Canvas and Module element (activated via "MODULE_SEQUENCE": "5" or "CANVAS_SEQUENCE": "5") -> Analyzer and Oscilloscope can now be displayed simultaneously
- Maximum and minimum peak markers in the oscilloscope graph (line and area)
- Added detection and insertion of the multipath icon (element from the UI add-on plugin) to the header bar
- Fixed a false start issue with the audio display in the signal meter

### v2.2
- Improved Pilot, MPX, and RDS calculations
- Enabled display of other signal patterns in the scope display
- Refined tilt correction
- Scaling adjustment
- Expanded horizontal zoom in scope mode
- Revised cursor alignment in analyzer mode
- CPU/Network Optimization: Spectrum/Scope calculation is gated (only active when accessed via a browser)
- New variable EnableAnalyzerAdminMode restricts analyzer/oscilloscope display to administrators

### v2.1

- Integration of an oscilloscope (click on MPX Spectrum title in the analyzer!)
- New variable for adjusting the tilt at the sound card input (see configuration options!)
- Sound card reconnect logic built in (Tnx to AmateurAudioDude)

### v2.0

- Using our own program library for spectrum analysis and display calculation -> more resource-efficient and higher measurement accuracy
- New scale variables for PILOT, MPX and RDS (see calibration)
- Automatic detection of the MPX channel
- Fixed issues with relative image paths

### v1.5

- Improved PILOT/MPX/RDS detection
- Corrected faulty spectrum display on smartphone screen
- Separate input control added for spectrum and meter display
- Added custom color adjustments for meter displays and highest peak
- Adjusting the RDS meter scale to the pilot display
- Configuration variables restructured for improved clarity (see configuraion options)
- An automatic backup of the JSON configuration file is created

### v1.4

- Added button with additional MPX/Signal Canvas display (see Configuration Options)
- Added improved FFT support for modern CPUs (see Configuration Options - thanks to AmateurAudioDude)
- Improved PILOT/MPX/RDS detection
- Added startup activation for the Spectrum Graph plugin
- Added MPXBoost to enhance the MPX spectrum (see Configuration Options)
- ESP32 MPX Auto Switching synchronized with Headless TEF command


### v1.3

- Signal diagram with time display and frequency marking added (new module), press CTRL for individual zoom options
- Quick module switching possible using numeric keys
- White border removed from the ECC flag
- Tooltip for module switching revised

### v1.2

- Additional  sound card for only MPX encoding can be activated
- A new variable "ExtStereoDecoder" has been added to also activate the mono/stereo signaling when using a ext. stereo decoder e.q. MPX Tool
- Optimization & fix calibration of level and analysis displays, the values ​​can be individually calibrated in the JSON file
- Volume control can now be activated if needed
- MPX Encode Script for 96/192 kHz sampling under Linux (Thanks to <@840861090375401501> )
- Headless TEF software switching Mono <> Stereo <> MPX
- Various zoom options for analyzer display (press STRG Button for options!)
- Discreet real-time display of measured values ​​above the bar graph display
- MPX Mode display integrated

### v1.1a

- Fixed incorrect display of TA, TP and RDS

### v1.1

- MPX software switching for ESP32 TEF receivers has been added with the new [BETA firmware v2.20.5](https://github.com/Highpoint2000/MetricsMonitor/raw/refs/heads/main/firmware/TEF6686_ESP32_Dev_Beta_%20v2.20.5.zip). Three modes are available (see configuration options!).
- Multiple WebSocket connections revised

### v1.0a

- Unit of measurement corrected at MPX level
- Variables for individually adjusting the spectrum have been added (see Configuration options)

### v1.0

- Three display modes: Audio + PILOT/MPX/RDS spectrum analysis / Audio + equalizer (Switching is done by clicking on the display)
# TEST
