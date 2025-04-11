document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('api-key');
    const saveBtn = document.getElementById('save-btn');
    const statusDiv = document.getElementById('status');
    
    // Load saved API key if it exists
    browser.storage.local.get('apiKey', function(result) {
      if (result.apiKey) {
        // Show only a few characters of the key for security
        const maskedKey = result.apiKey.substring(0, 3) + '...' + 
                          result.apiKey.substring(result.apiKey.length - 4);
        apiKeyInput.value = maskedKey;
        apiKeyInput.placeholder = 'Click to edit API key';
        
        // Clear input when clicked to allow editing
        apiKeyInput.addEventListener('focus', function() {
          if (apiKeyInput.value === maskedKey) {
            apiKeyInput.value = '';
          }
        });
      }
    });
    
    // Save API key when button is clicked
    saveBtn.addEventListener('click', function() {
      const apiKey = apiKeyInput.value.trim();
      
      if (apiKey) {
        browser.storage.local.set({ apiKey: apiKey }, function() {
          showStatus('API key saved successfully!', 'success');
        });
      } else {
        showStatus('Please enter a valid API key', 'error');
      }
    });
    
    function showStatus(message, type) {
      statusDiv.textContent = message;
      statusDiv.className = 'status ' + type;
      statusDiv.style.display = 'block';
      
      setTimeout(function() {
        statusDiv.style.display = 'none';
      }, 3000);
    }
  });
  