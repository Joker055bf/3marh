import emailjs from '@emailjs/browser';

/**
 * Email Service using EmailJS with Gmail SMTP (App Password)
 * Service: service_ge68n7u (Custom SMTP - smtp.gmail.com:465)
 * Template: template_o5tujxe (Password Reset)
 */

const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_ucpfuem',  // Gmail SMTP Custom Service (App Password)
  TEMPLATE_ID: 'template_o5tujxe', // Password Reset template
  PUBLIC_KEY: 'CscpnAXudUmh_XgeT',
};

// Initialize EmailJS
emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);

export const sendVerificationCode = async (toEmail: string, code: string, userName: string): Promise<boolean> => {
  try {
    const templateParams = {
      to_email: toEmail,
      user_name: userName,
      verification_code: code,
    };

    const response = await emailjs.send(
      EMAILJS_CONFIG.SERVICE_ID,
      EMAILJS_CONFIG.TEMPLATE_ID,
      templateParams
    );

    return response.status === 200;
  } catch (error: any) {
    console.warn('EmailJS send failed:', error?.text || error?.message || error);
    return false;
  }
};
