chrome.runtime.onInstalled.addListener(() => {
  console.log('TabNotes installed');
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.action.openPopup();
  }
});
