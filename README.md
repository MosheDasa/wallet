# ביטוח ישיר · Google Wallet

מערכת Full-Stack עם API ב־Node.js, TypeScript ו־Express וממשק React, TypeScript ו־Ant Design בעברית וב־RTL. מסלול ההנפקה משתמש ב־Google Wallet API אמיתי; אין מצב הדגמה או קישור שמתחזה לשמירה בארנק.

## הפעלה

דרישות: Node.js 20 ומעלה.

    npm install

העתיקו את .env.example ל־.env בשורש הפרויקט, והגדירו שם Issuer ID וחשבון שירות תקינים.

    npm run dev

הממשק עולה ב־http://localhost:5173 וה־API ב־http://localhost:4000. לבניית גרסת פריסה:

    npm run build
    npm start

## הגדרת Google Wallet

1. יש להשלים onboarding ב־Google Wallet Console, להפעיל את Wallet API ולתת לחשבון השירות הרשאת Developer.
2. יש להגדיר GOOGLE_WALLET_ISSUER_ID ונתיב לקובץ המפתח ב־GOOGLE_APPLICATION_CREDENTIALS, או לספק את מפתח השירות ב־GOOGLE_SERVICE_ACCOUNT_JSON.
3. יש להגדיר CLIENT_ORIGIN, PUBLIC_API_ORIGIN ו־CAR_RENEWAL_URL לסביבת הפריסה.
4. קובץ השירות נטען גם כשהנתיב יחסי ל־.env שבשורש הפרויקט. קובצי מפתח של חשבון שירות מוחרגים מ־Git.

בעת הנפקה, השרת יוצר לפי הצורך מחלקות GenericClass ואובייקטים אמיתיים ב־Google Wallet, חותם JWT יחיד לכל הפוליסות שנבחרו, ומחזיר קישור שמירה של Google. המשתמש צריך להשלים את השמירה בחשבון Google שלו. הכרטיסים מקובצים באמצעות groupingInfo.groupingId יציב הנגזר ממזהה הלקוח.

## מבנה תיקיות

    client/src/App.tsx
    client/src/api.ts
    client/src/components/CustomerPolicyPanel.tsx
    client/src/components/WalletCardsPanel.tsx
    client/src/styles.css
    server/src/config.ts
    server/src/domain/policies.ts
    server/src/domain/types.ts
    server/src/http/routes.ts
    server/src/services/issuedCardRepository.ts
    server/src/services/walletService.ts
    server/src/index.ts

## שמירת כרטיסים שהונפקו

`server/data/issued-cards.json` נשמר כאינדקס קריא לפי לקוח, ובו פרטי תצוגה ומיקום הקובץ. הנתונים המלאים של כל לקוח נשמרים בנפרד תחת `server/data/issued-cards-data/<customerId>.json`. בהפעלה הראשונה אחרי השדרוג, מערך הכרטיסים הישן ב־`issued-cards.json` מועבר אוטומטית למבנה החדש. קובצי הנתונים המקומיים מוחרגים מ־Git.

## נתיבי API

| Method | Route | פעולה |
|---|---|---|
| GET | /api/health | מצב הגדרת Wallet API |
| GET | /api/customers | רשימת לקוחות |
| GET | /api/customers/:customerId/policies | פוליסות של לקוח |
| GET | /api/wallet/customers/:customerId/cards | כרטיסים שנרשמו במערכת |
| GET | /api/wallet/objects/:objectId/google | אובייקט הכרטיס כפי שהוא נשמר ב־Google Wallet |
| POST | /api/wallet/issue | יצירת כרטיסים וקישור שמירה מקובץ |
| POST | /api/wallet/objects/:objectId/messages | הודעת Wallet והתראת Android |
| DELETE | /api/wallet/objects/:objectId/messages/:messageIndex | הסרת הודעה מהכרטיס ב־Google Wallet |
| POST | /api/wallet/objects/:objectId/links | הוספת קישור ל־linksModuleData בכרטיס |
| DELETE | /api/wallet/objects/:objectId/links | מחיקת כל הקישורים מהכרטיס |
| DELETE | /api/wallet/objects/:objectId/links/:linkIndex | מחיקת קישור מהכרטיס |
| PATCH | /api/wallet/objects/:objectId/links/reorder | שינוי סדר הקישורים בכרטיס |
| PATCH | /api/wallet/objects/:objectId | עדכון כותרת, שורת משנה או צבע |
| POST | /api/wallet/objects/:objectId/expire | סימון כרטיס כפג תוקף |
| POST | /api/wallet/objects/:objectId/car-renewal | הודעת חידוש ועדכון קישור הרכב |

פעולת חידוש הרכב היא בקשת API אחת לשרת, שמבצעת עדכון קישור והוספת הודעה דרך שתי פעולות Google Wallet API.

## לפני שימוש מול לקוחות

רשימת הלקוחות והפוליסות בפרויקט היא נתוני פיתוח. יש לחבר אותה ל־CRM ולבסיס הנתונים האמיתי של החברה, ולהחליף את רישום JSON המקומי בבסיס נתונים משותף ומאובטח. שליחת TEXT_AND_NOTIFY מבקשת מ־Google Wallet להציג הודעה ולשלוח התראה; מסירתה תלויה ב־Google ובהגדרות המכשיר.
