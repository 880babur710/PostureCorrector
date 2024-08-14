let webcamRunning = false;
let captureIsReady = false;
let captureTabId = null;
let popupIsOpen = false;
let blocking = false;
let selectedWebcam;
let currentWarningMethod;
let currentActivity;
let firstWebcamNotSentToCapture;
let firstWarningMethodNotSentToCapture;
let firstActivityNotSentToCapture;
let isBlurred = false;


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'webcamSelected') {
        sendWebcamInfoToCapture(message.selectedWebcam);
    } else if (message.type === 'powerButton') {
        if (captureTabId) {
            chrome.runtime.sendMessage({ type: 'closeCaptureTab' });
        } else {
            openCaptureTab();
        }
    } else if (message.type === 'sendNotification') {
        sendWarningNotification();
    } else if (message.type === "blurScreen") {
        console.error("WILL START BLURRING");
        setBlurState(true);
    } else if (message.type === 'unblurScreen') {
        console.error("WILL STOP BLURRING");
        setBlurState(false);
    } else if (message.type === 'warningMethod') {
        sendWarningInfoToCapture(message.warningMethod);
    } else if (message.type === 'activity') {
        sendActivityInfoToCapture(message.activity);
    } else if (message.type === 'captureIsReady') {
        setCaptureToReady();
    } else if (message.type === 'captureIsReadyToClose') {
        closeCaptureTab();
    } else if (message.action === 'contentScriptReady') {
        if (isBlurred) {
            applyBlurToTab(sender.tab.id, true)
        }
    }
});


function sendWebcamInfoToCapture(webcamId) {
    selectedWebcam = webcamId;
    if (captureIsReady) {
        chrome.runtime.sendMessage({ type: 'webcam', selectedWebcam: selectedWebcam });
    } else {
        firstWebcamNotSentToCapture = true;
    }
}


function sendWarningInfoToCapture(warningMethod) {
    currentWarningMethod = warningMethod;
    if (captureIsReady) {
        chrome.runtime.sendMessage({ type: 'warningMethod', warningMethod: currentWarningMethod });
    } else {
        firstWarningMethodNotSentToCapture = true;
    }
}


function sendActivityInfoToCapture(activity) {
    currentActivity = activity;
    if (captureIsReady) {
        chrome.runtime.sendMessage({ type: 'activity', activity: currentActivity });
    } else {
        firstActivityNotSentToCapture = true;
    }
}


function setCaptureToReady() {
    captureIsReady = true;
    if (firstWebcamNotSentToCapture === true) {
        chrome.runtime.sendMessage({ type: 'webcam', selectedWebcam: selectedWebcam });  
    }
    if (firstWarningMethodNotSentToCapture === true) {
        chrome.runtime.sendMessage({ type: 'warningMethod', warningMethod: currentWarningMethod });
    }
    if (firstActivityNotSentToCapture === true) {
        chrome.runtime.sendMessage({ type: 'activity', activity: currentActivity });
    }
}


chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (tabId === captureTabId) {
        resetVariables();
        chrome.storage.local.set({ extensionIsOn: false });
    }
});


function openCaptureTab() {
    chrome.windows.getCurrent((window) => {
        chrome.tabs.create({ url: 'capture.html', active: false }, (tab) => {
            captureTabId = tab.id;
        });
    });
    webcamRunning = true;
}


function closeCaptureTab() {

    if (captureTabId) {
        chrome.tabs.remove(captureTabId);
        resetVariables();
    }
}


function resetVariables() {
    captureTabId = null;
    webcamRunning = false;
    captureIsReady = false;
    selectedWebcam = undefined;
    currentActivity = undefined;
    firstWebcamNotSentToCapture = undefined;
    firstActivityNotSentToCapture = undefined;
}


function sendWarningNotification() {
    chrome.notifications.create('warningNotification', {
        type: 'basic',
        title: 'Warning',
        message: 'Bad posture has been detected for more than 15 seconds. Please correct your posture.',
        priority: 2,
        iconUrl: 'icons/icon128.png'
    });
}


function setBlurState(blur) {
    isBlurred = blur;
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            applyBlurToTab(tab.id, blur);
        });
    });
}


function applyBlurToTab(tabId, blur) {
    chrome.tabs.sendMessage(tabId, { action: blur ? 'blur' : 'unblur' })
        .catch(() => {
            // If there's an error, inject the content script and try again
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            }).then(() => {
                // After injection, wait a bit and try to send the message again
                setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, { action: blur ? 'blur' : 'unblur' })
                        .catch(error => console.log(`Error sending message to tab ${tabId} after injection:`, error));
                }, 100);
            }).catch(error => console.log(`Error injecting script into tab ${tabId}:`, error));
        });
}


chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && isBlurred) {
        applyBlurToTab(tabId, true);
    }
});


chrome.runtime.onStartup.addListener(() => {
    if (isBlurred) {
        setBlurState(true);
    }
});
