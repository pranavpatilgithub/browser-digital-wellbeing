// Storage structure:
// {
//   "siteData": {
//     "2025-02-25": {  // Today's date YYYY-MM-DD
//       "example.com": {
//         "timeSpent": 3600,  // seconds
//         "lastUpdated": 1708851600000  // timestamp
//       }
//     }
//   }
// }

let activeTabId = null;
let activeTabDomain = null;
let activeTabStartTime = null;
let trackedSites = {};

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Get yesterday's date in YYYY-MM-DD format
function getYesterdayDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Get dates for the past week in YYYY-MM-DD format
function getWeekDates() {
  const dates = [];
  const today = new Date();
  
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(today.getDate() - i);
    dates.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
  }
  
  return dates;
}

// Extract domain from URL
function extractDomain(url) {
  if (!url) return null;
  
  try {
    const hostname = new URL(url).hostname;
    return hostname.startsWith('www.') ? hostname.substring(4) : hostname;
  } catch (e) {
    return null;
  }
}

// Initialize site data for a new day
function initDailyData() {
  const today = getTodayDate();
  
  chrome.storage.local.get(['siteData'], function(result) {
    const siteData = result.siteData || {};
    
    // If today's data doesn't exist, create it
    if (!siteData[today]) {
      siteData[today] = {};
      chrome.storage.local.set({siteData: siteData});
    }
  });
}

// Update time spent for the active tab
function updateTimeSpent() {
  if (!activeTabId || !activeTabDomain || !activeTabStartTime) return;
  
  const now = Date.now();
  const timeSpent = Math.floor((now - activeTabStartTime) / 1000);
  activeTabStartTime = now;
  
  if (timeSpent <= 0) return;
  
  const today = getTodayDate();
  
  chrome.storage.local.get(['siteData'], function(result) {
    const siteData = result.siteData || {};
    
    if (!siteData[today]) {
      siteData[today] = {};
    }
    
    if (!siteData[today][activeTabDomain]) {
      siteData[today][activeTabDomain] = {
        timeSpent: 0,
        lastUpdated: now
      };
    }
    
    siteData[today][activeTabDomain].timeSpent += timeSpent;
    siteData[today][activeTabDomain].lastUpdated = now;
    
    chrome.storage.local.set({siteData: siteData});
  });
}

// Track active tab changes
function handleTabChange(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.active) {
    const domain = extractDomain(tab.url);
    
    // Update time for previous active tab
    updateTimeSpent();
    
    // Set new active tab
    activeTabId = tabId;
    activeTabDomain = domain;
    activeTabStartTime = Date.now();
  }
}

// Track tab activation
function handleTabActivation(activeInfo) {
  // Update time for previous active tab
  updateTimeSpent();
  
  chrome.tabs.get(activeInfo.tabId, function(tab) {
    const domain = extractDomain(tab.url);
    
    // Set new active tab
    activeTabId = activeInfo.tabId;
    activeTabDomain = domain;
    activeTabStartTime = Date.now();
  });
}

// Get site data based on period
function getSiteData(period) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['siteData'], function(result) {
      const siteData = result.siteData || {};
      let periodData = {};
      
      if (period === 'today') {
        // Today's data
        const today = getTodayDate();
        periodData = siteData[today] || {};
      } 
      else if (period === 'yesterday') {
        // Yesterday's data
        const yesterday = getYesterdayDate();
        periodData = siteData[yesterday] || {};
      } 
      else if (period === 'week') {
        // Week's data (aggregated)
        const weekDates = getWeekDates();
        
        weekDates.forEach(date => {
          if (siteData[date]) {
            Object.entries(siteData[date]).forEach(([domain, data]) => {
              if (!periodData[domain]) {
                periodData[domain] = {
                  timeSpent: 0,
                  lastUpdated: data.lastUpdated
                };
              }
              periodData[domain].timeSpent += data.timeSpent;
              periodData[domain].lastUpdated = Math.max(periodData[domain].lastUpdated, data.lastUpdated);
            });
          }
        });
      }
      
      resolve(periodData);
    });
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getSiteData') {
    getSiteData(request.period).then(data => {
      sendResponse({data: data});
    });
    return true; // Required for async sendResponse
  } 
  else if (request.action === 'getActiveTabDomain') {
    sendResponse({domain: activeTabDomain});
  }
});

// Initialize
chrome.runtime.onStartup.addListener(function() {
  initDailyData();
});

chrome.runtime.onInstalled.addListener(function() {
  initDailyData();
});

// Set up listeners
chrome.tabs.onUpdated.addListener(handleTabChange);
chrome.tabs.onActivated.addListener(handleTabActivation);

// Periodically update time spent (every 30 seconds)
setInterval(updateTimeSpent, 30000);

// Check for new day every minute
setInterval(function() {
  const today = getTodayDate();
  
  chrome.storage.local.get(['lastDayChecked'], function(result) {
    const lastChecked = result.lastDayChecked || '';
    
    if (lastChecked !== today) {
      initDailyData();
      chrome.storage.local.set({lastDayChecked: today});
    }
  });
}, 60000);
