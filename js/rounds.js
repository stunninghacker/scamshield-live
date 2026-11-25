// =====================================================================
// rounds.js — the 8 "Spot the Scam" messages (DATA ONLY, no logic).
//
// Each round:
//   id       number 1-8
//   short    short name (used in the report chart)
//   type     how it is drawn: 'sms' | 'whatsapp' | 'email' | 'upi' | 'qr'
//   sender   who it appears to come from
//   time     time shown on the message
//   subject  (email only)
//   amount   (upi only)
//   text     the message itself (this is what the engine checks)
//   answer   'scam' or 'legit'
//   explain  one line shown after answering
//   flags    extra words to highlight (besides what the engine finds)
//
// Rule (checked on tests/engine.test.html): every scam round must be
// SUSPICIOUS or DANGEROUS in the engine, every legit round must be SAFE.
// =====================================================================

export const ROUNDS = [
  {
    id: 1,
    short: 'Fake KYC SMS',
    type: 'sms',
    sender: 'VK-SBIKYC',
    time: '9:38 am',
    text: 'Dear SBI customer, your account will be BLOCKED today due to incomplete KYC. ' +
      'Update KYC immediately at http://sbi-kyc-update.xyz/verify to avoid suspension.',
    answer: 'scam',
    explain: 'Fake bank link (.xyz) + panic. Banks never send KYC links by SMS.',
    flags: ['today'],
  },
  {
    id: 2,
    short: 'Bank debit alert',
    type: 'sms',
    sender: 'AD-HDFCBK',
    time: '1:12 pm',
    text: 'Rs.1,250 debited from A/c XX4821 on 18-Nov at AMAZON PAY. Avl bal Rs.23,410. ' +
      'Not you? Call the number on the back of your card. -HDFC Bank',
    answer: 'legit',
    explain: 'No link, no OTP request, and it tells you to use the number on YOUR card. That is how real alerts look.',
    flags: [],
  },
  {
    id: 3,
    short: 'Part-time job',
    type: 'whatsapp',
    sender: '+91 98XXX X2741',
    time: '11:04 am',
    text: 'Hello dear 😊 We are hiring for a part-time job. Work from home and earn ₹5000/day ' +
      'just by liking YouTube videos. No experience needed! Join our Telegram group to start today.',
    answer: 'scam',
    explain: 'Task scam: they pay small amounts first, then ask you to "invest" and vanish with it.',
    flags: ['No experience needed'],
  },
  {
    id: 4,
    short: 'Courier fee',
    type: 'sms',
    sender: 'JX-INPOST',
    time: '6:47 pm',
    text: 'India Post: Your parcel is on hold due to incomplete address. Pay ₹25 re-delivery fee ' +
      'within 24 hours: https://bit.ly/ip-redeliver',
    answer: 'scam',
    explain: 'A tiny fee is the bait — the fake page steals your card details. India Post does not ask for fees by SMS link.',
    flags: ['on hold'],
  },
  {
    id: 5,
    short: 'Login OTP',
    type: 'sms',
    sender: 'BZ-SWIGGY',
    time: '8:15 pm',
    text: '123456 is your login OTP. Do not share it with anyone.',
    answer: 'legit',
    explain: 'A real OTP that YOU requested, warning you not to share it. Safe — as long as you never share it.',
    flags: [],
  },
  {
    id: 6,
    short: 'UPI cashback',
    type: 'upi',
    sender: 'cashback.rewards@ybl',
    time: '4:20 pm',
    amount: '₹5,000',
    text: 'Congratulations! Receive ₹5,000 cashback from cashback.rewards@ybl. Enter your UPI PIN to accept.',
    answer: 'scam',
    explain: 'You never enter your PIN to RECEIVE money. A PIN is only for SENDING.',
    flags: [],
  },
  {
    id: 7,
    short: 'Refund QR',
    type: 'qr',
    sender: '+91 70XXX X8815',
    time: '10:51 pm',
    text: 'Hi, this is the online shopping refund desk. Your refund of ₹1,499 is approved. ' +
      'Scan this QR code to receive your refund directly in your bank account.',
    answer: 'scam',
    explain: 'Scanning a QR code always SENDS money. Nobody needs you to scan anything to pay you.',
    flags: [],
  },
  {
    id: 8,
    short: 'Exam email',
    type: 'email',
    sender: 'Examination Cell <exam.cell@university.edu.in>',
    time: '10:00 am',
    subject: 'End-Semester Examination Timetable released',
    text: 'Dear Students,\n\nThe timetable for the End-Semester Examinations has been released. ' +
      'Please check it on the official university ERP portal under Examinations > Timetable. ' +
      'Admit cards will be available on the same portal one week before the exams.\n\n' +
      'For any queries, contact your department coordinator.\n\nRegards,\nExamination Cell',
    answer: 'legit',
    explain: 'No link to click, no payment, no secret. It sends you to the portal you already use.',
    flags: [],
  },
];
