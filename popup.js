document.addEventListener('DOMContentLoaded', function() {
    const siteList = document.getElementById('siteList');
    const periodBtns = document.querySelectorAll('.period-btn');
    const daySelector = document.getElementById('daySelector');
    const dayButtons = document.getElementById('dayButtons');
    let activePeriod = 'today';
    let selectedDate = '';
    let weekDates = [];
    let currentView = 'week'; // 'week' or 'day'
    
    // Update UI based on selected period
    function updatePeriodUI() {
      periodBtns.forEach(btn => {
        if (btn.dataset.period === activePeriod) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      
      // Show/hide day selector for week view
      if (activePeriod === 'week') {
        generateDayButtons();
        daySelector.style.display = 'block';
      } else {
        daySelector.style.display = 'none';
      }
      
      loadSiteData();
    }
    
    // Generate buttons for each day of the week
    function generateDayButtons() {
      weekDates = getWeekDates();
      dayButtons.innerHTML = '';
      
      weekDates.forEach((date, index) => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dateObj = new Date(date);
        const dayName = dayNames[dateObj.getDay()];
        
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.setAttribute('data-date', date);
        
        // Format date as "Mon 25"
        const day = dateObj.getDate();
        btn.textContent = `${dayName} ${day}`;
        
        if (index === 0) {
          btn.classList.add('active');
          selectedDate = date;
        }
        
        btn.addEventListener('click', function() {
          document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          selectedDate = this.dataset.date;
          
          // Set view to 'day' when a specific day is selected
          setViewMode('day');
          loadSiteData();
        });
        
        dayButtons.appendChild(btn);
      });
      
      // Add view mode buttons event listeners
      document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          setViewMode(this.dataset.view);
          loadSiteData();
        });
      });
    }
    
    // Set view mode (week total or single day)
    function setViewMode(mode) {
      currentView = mode;
      document.querySelectorAll('.view-btn').forEach(btn => {
        if (btn.dataset.view === mode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
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
    
    // Load site data for the selected period
    function loadSiteData() {
      if (activePeriod === 'week' && currentView === 'day' && selectedDate) {
        // Load data for specific day in week view
        chrome.storage.local.get(['siteData'], function(result) {
          const siteData = result.siteData || {};
          displaySiteData(siteData[selectedDate] || {});
        });
      } else {
        // Load regular period data
        chrome.runtime.sendMessage({action: 'getSiteData', period: activePeriod}, function(response) {
          displaySiteData(response.data);
        });
      }
    }
    
    // Display site data in the UI
    function displaySiteData(data) {
      siteList.innerHTML = '';
      
      if (Object.keys(data).length === 0) {
        const noData = document.createElement('div');
        noData.className = 'no-data';
        noData.textContent = 'No data available for this period';
        siteList.appendChild(noData);
        return;
      }
      
      // Convert to array, sort by time spent (descending)
      const sortedSites = Object.entries(data)
        .sort((a, b) => b[1].timeSpent - a[1].timeSpent);
      
      // Calculate total time
      let totalSeconds = 0;
      sortedSites.forEach(([_, siteData]) => {
        totalSeconds += siteData.timeSpent;
      });

      // Update total time display
      document.getElementById('totalTime').textContent = `Total: ${formatTime(totalSeconds)}`;
      
      sortedSites.forEach(([domain, siteData]) => {
        const siteItem = document.createElement('div');
        siteItem.className = 'site-item';
        
        const favicon = document.createElement('img');
        favicon.className = 'favicon';
        favicon.src = `https://www.google.com/s2/favicons?domain=${domain}`;
        favicon.onerror = function() {
          this.src = 'icon-default.png';
        };
        
        const siteInfo = document.createElement('div');
        siteInfo.className = 'site-info';
        
        const siteName = document.createElement('div');
        siteName.className = 'site-name';
        siteName.textContent = domain;
        
        const siteTime = document.createElement('div');
        siteTime.className = 'site-time';
        siteTime.textContent = formatTime(siteData.timeSpent);
        
        siteInfo.appendChild(siteName);
        siteInfo.appendChild(siteTime);
        
        siteItem.appendChild(favicon);
        siteItem.appendChild(siteInfo);
        
        siteList.appendChild(siteItem);
      });
    }
    
    // Format time in HH:MM:SS
    function formatTime(seconds) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    // Update time for currently active sites in real-time
    function updateActiveTime() {
      if (activePeriod !== 'today' || (activePeriod === 'week' && currentView === 'day' && selectedDate !== getTodayDate())) {
        return; // Only update active time for today's view
      }
      
      chrome.runtime.sendMessage({action: 'getActiveTabDomain'}, function(response) {
        if (!response || !response.domain) return;
        
        const activeDomain = response.domain;
        const siteItems = document.querySelectorAll('.site-item');
        let activeFound = false;
        
        siteItems.forEach(item => {
          const siteName = item.querySelector('.site-name').textContent;
          if (siteName === activeDomain) {
            activeFound = true;
            const timeElement = item.querySelector('.site-time');
            const currentTime = timeToSeconds(timeElement.textContent);
            timeElement.textContent = formatTime(currentTime + 1);
            
            // Update total time
            const totalTimeElement = document.getElementById('totalTime');
            const totalTimeText = totalTimeElement.textContent.replace('Total: ', '');
            const totalTime = timeToSeconds(totalTimeText);
            totalTimeElement.textContent = `Total: ${formatTime(totalTime + 1)}`;
          }
        });
      });
    }
    
    // Get today's date in YYYY-MM-DD format
    function getTodayDate() {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    
    // Convert HH:MM:SS to seconds
    function timeToSeconds(timeStr) {
      const [hrs, mins, secs] = timeStr.split(':').map(Number);
      return (hrs * 3600) + (mins * 60) + secs;
    }
    
    // Set up period button event listeners
    periodBtns.forEach(btn => {
      btn.addEventListener('click', function() {
        activePeriod = this.dataset.period;
        updatePeriodUI();
      });
    });
    
    // Initial load
    updatePeriodUI();
    
    // Real-time updates
    setInterval(updateActiveTime, 1000);
    
    // Refresh data periodically (every 30 seconds)
    setInterval(loadSiteData, 30000);
});
