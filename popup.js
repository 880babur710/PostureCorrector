const dropdown = document.getElementById('webcamDropdown');
const saveGoodPostureButton = document.getElementById("goodPosture");
const warningRadioButtons = document.querySelectorAll('input[name="warningMethod"]');
const activityRadioButtons = document.querySelectorAll('input[name="activity"]');
const saveButtonMsgElement = document.getElementById('saveButtonMessage');
let selectedDeviceId;
let webcamRunning = false;
let currentWarningMethod;
let currentActivity;



async function getAllWebcams() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    return videoDevices;
}


async function createWebcamDropdown() {
    const webcams = await getAllWebcams();
    dropdown.innerHTML = ''; // Clear existing options
    
    webcams.forEach((webcam, index) => {
        const option = document.createElement('option');
        option.value = webcam.deviceId;
        option.text = webcam.label || `Camera ${index + 1}`;
        dropdown.appendChild(option);
    });
}


function handleWebcamSelection() {
    selectedDeviceId = dropdown.value;
    chrome.storage.local.set({ webcamId: selectedDeviceId });
    chrome.runtime.sendMessage({ type: 'webcamSelected', selectedWebcam: selectedDeviceId });
}


dropdown.addEventListener('change', handleWebcamSelection());


document.querySelectorAll('.toggle-switch input').forEach((checkbox) => {
    checkbox.addEventListener('change', function() {
        const toggleText = this.nextElementSibling.querySelector('.toggle-text');
        if (this.id === 'powerSwitch') {
            toggleText.textContent = this.checked ? 'ON' : 'OFF';
            webcamRunning = this.checked ? true : false;
            chrome.storage.local.set({ extensionIsOn: this.checked });
            chrome.runtime.sendMessage({ type: 'powerButton' });
            // if (webcamRunning) {
            //     window.close();
            // }
        } else {
            toggleText.textContent = this.checked ? 'YES' : 'NO';
            chrome.storage.local.set({ warningPermitted: this.checked });
        }
    });
});


activityRadioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
        if (radio.checked) {
            chrome.storage.local.set({ activity: radio.value });
            currentActivity = radio.value;
            chrome.runtime.sendMessage({ type: 'activity', activity: radio.value });
        }
    });
});


warningRadioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
        if (radio.checked) {
            chrome.storage.local.set({ warningMethod: radio.value });
            currentWarningMethod = radio.value;
            chrome.runtime.sendMessage({ type: 'warningMethod', warningMethod: radio.value });
        }
    });
});


saveGoodPostureButton.addEventListener('click', () => {
    if (webcamRunning && currentWarningMethod && currentActivity) {
        saveButtonMsgElement.textContent = '';
        chrome.runtime.sendMessage({ type: 'saveGoodPosture' });
    } else if (!webcamRunning && !currentWarningMethod && !currentActivity) {
        saveButtonMsgElement.textContent = '*Please turn on the extension, select your warning method, and select your activity';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    } else if (webcamRunning && currentWarningMethod) {
        saveButtonMsgElement.textContent = '*Please select your activity';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    } else if (webcamRunning && currentActivity) {
        saveButtonMsgElement.textContent = '*Please select your warning method';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    } else if (currentWarningMethod && currentActivity) {
        saveButtonMsgElement.textContent = '*Please turn on the extension';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    } else if (webcamRunning) {
        saveButtonMsgElement.textContent = '*Please select your warning method and activity';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    } else if (currentWarningMethod) {
        saveButtonMsgElement.textContent = '*Please turn on your extension and select your activity';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    } else if (currentActivity) {
        saveButtonMsgElement.textContent = '*Please turn on your extension and select your warning method';
        saveButtonMsgElement.scrollIntoView({ behavior: 'smooth' });
    }
});


document.addEventListener('DOMContentLoaded', () => {
    createWebcamDropdown();
    
    chrome.storage.local.get(['webcamId'], (result) => {
        if (result.webcamId) {
            dropdown.value = result.webcamId;
        }
    });

    chrome.storage.local.get(['extensionIsOn'], (result) => {
        if (result.extensionIsOn) {
            if (result.extensionIsOn === true) {
                document.getElementById('powerSwitch').checked = true;
                document.getElementById('powerText').textContent = 'ON';
                webcamRunning = true;
            } else if (result.extensionIsOn === false) {
                document.getElementById('powerSwitch').checked = false;
                document.getElementById('powerText').textContent = 'OFF';
                webcamRunning = false;
            }
        }
    });

    chrome.storage.local.get(['warningMethod'], result => {
        warningRadioButtons.forEach(radio => {
            if (radio.value === result.warningMethod) {
                radio.checked = true;
                currentWarningMethod = radio.value;
            }
        });
    });

    chrome.storage.local.get(['activity'], result => {
        activityRadioButtons.forEach(radio => {
            if (radio.value === result.activity) {
                radio.checked = true;
                currentActivity = radio.value;
            }
        });
    });
});