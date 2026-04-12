export { createSendGridClient, type SendGridOptions, type SendGridClient, type EmailMessage } from './sendgrid.js';
export { createTwilioClient, toE164, type TwilioOptions, type TwilioClient, type SmsMessage } from './twilio.js';
export { createTeamsClient, type TeamsOptions, type TeamsClient, type CardMessage } from './teams.js';

export {
  emailWrapper,
  detailTable,
  detailRow,
  heading,
  paragraph,
  button,
  divider,
  type EmailWrapperOptions,
} from './email-templates.js';
