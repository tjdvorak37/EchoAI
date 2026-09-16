# Microsoft 365 Support Reply Ingestion

Customer email replies reach the `support@echoaipro.com` Microsoft 365 mailbox. A Power Automate flow must forward those messages to EchoAI so they can be added to the matching ticket.

## 1. Configure inbound settings in EchoAI

1. Sign in to EchoAI as Super Admin or a technician with **Company Email & SMTP** editing access.
2. Open **IT / Admin Backend > Platform > Company Email & SMTP > Mailbox & Email Password**.
3. In **Inbound Ticket Replies**, enter the Microsoft 365 support mailbox address.
4. Enter a new random webhook key containing at least 24 characters.
5. Enable **Accept customer email replies into support tickets** and save.

The key is stored as a one-way hash and cannot be displayed after saving. Use the same value in the Power Automate HTTP action's `x-webhook-secret` header. When rotating it later, update the panel and Power Automate together.

## 2. Create the Power Automate flow

1. Create an automated cloud flow using **Office 365 Outlook - When a new email arrives (V3)**.
2. Select the `support@echoaipro.com` inbox.
3. Add an **HTTP** action with method `POST`.
4. Use this URL:

   `https://yxmsqrtoghrazfwweqqf.supabase.co/functions/v1/support-ticket-inbound`

5. Add headers:

   `Content-Type: application/json`

   `x-webhook-secret: <the secret configured above>`

6. Send this JSON body, inserting the corresponding dynamic Outlook values:

```json
{
  "from": "From (Address)",
  "fromName": "From (Name)",
  "subject": "Subject",
  "body": "Body",
  "bodyPreview": "Body Preview",
  "internetMessageId": "Internet Message Id"
}
```

7. Save and enable the flow.

The endpoint requires the ticket reference from the email subject or quoted body, verifies that the sender matches the ticket customer, ignores duplicate message IDs, adds the reply to the conversation, and moves the ticket to `in_progress`.