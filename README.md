# PostureCorrector
### main.py
- the Python implementation of posture detection using webcam footage. 

## Chrome extension files
### manifest.json
- specifies basic metadata and functionality of the extension

### popup.html, styles.css, popup.js
- files for the popup page of the browser extension
- allows the user to select the webcam they would like to use
- allows the user to select one of two different warning methods
- users can get warned by either receiving desktop notifications or getting all their browser tabs blurred
- allows the user to select their activity which will be used for the statistics that get displayed on the capture tab consisting of capture.html, capture-styles.css, and capture.js
- popup.js saves the users' choice and loads them whenever the user reopens the popup page

### content.js
- content script that is injected into the user's browser tabs
- contains code to blur and unblur the main content of the user's browser tabs
- receives messages from background.js and follows them to blur and unblur the tabs

### background.js
- service worker who keeps running the background
- receives messages from popup.js and creates a new browser tab using capture.html

### capture.html, capture-styles.css, capture.js
- files for the browser tab that get created when the user turns on the extension
- displays the webcam footage using the user's currently selected webcam
- displays graphs and charts that provide insight into the user's pattern of bad posture
- capture.js captures and sends the webcam frames to sandbox.js for processing and receives the results of processed frames back
- using the results of processed frames sent by sandbox.js, capture.js also tracks and records statistics such as bad posture percentage per each 3-hour time window (12am - 3am, 3am - 6am, ..., 9pm - 12am) and bad posture percentage per each user activity (work, study, entertainment)

### sandbox.html, sandbox.js
- given the raw webcam frames by capture.js, sandbox.js process these frames using OpenCV and Mediapipe to detect user's posture
- after processing each frame, sandbox.js sends the results to capture.js
