/* Direct SSE delivery. Phone signing keys stay in Android Keystore. */
(function(){
  'use strict';
  window.GBTI_DONATION_API=window.GBTI_DONATION_API||'https://69.8.137.191';
  if(window.GBTI_RECEIPT_ENDPOINT||!window.GBTI_DONATIONS)return;
  window.GBTI_DONATIONS.connect(window.GBTI_DONATION_API+'/api/stream');
})();
