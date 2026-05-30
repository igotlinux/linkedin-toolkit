// LinkedIn Toolkit - Content Script
// Runs on LinkedIn pages to enable DOM interactions

(function () {
  'use strict';

  // Respond to messages from the popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getSkills') {
      const skills = extractSkills();
      sendResponse({ skills });
    }
    return true;
  });

  function extractSkills() {
    const skills = [];
    const editLinks = document.querySelectorAll('a[aria-label]');

    editLinks.forEach(link => {
      const label = link.getAttribute('aria-label') || '';
      const match = label.match(/^Edit (.+?) skill$/i);
      if (match) {
        skills.push({
          name: match[1].trim(),
          editHref: link.getAttribute('href') || ''
        });
      }
    });

    return skills;
  }
})();
