/* Public read-only endpoint. Authentication stays in the phone's Android Keystore. */
(function(){
  'use strict';
  if(window.GBTI_RECEIPT_ENDPOINT||!window.GBTI_DONATIONS)return;
  window.GBTI_DONATIONS.connectPolling('https://69.8.137.191/api/events');
})();
