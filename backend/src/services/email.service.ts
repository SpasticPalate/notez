import { Resend } from 'resend';

class EmailService {
  private resend: Resend | null = null;
  private fromEmail: string;
  private appName: string;
  private appUrl: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@notez.local';
    this.appName = process.env.APP_NAME || 'Notez';
    this.appUrl = process.env.APP_URL || 'http://localhost:5173';
  }

  private getClient(): Resend {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY environment variable is not set');
      }
      this.resend = new Resend(apiKey);
    }
    return this.resend;
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    username: string,
    resetToken: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('Email service not configured - RESEND_API_KEY not set');
      return false;
    }

    const resetUrl = `${this.appUrl}/reset-password?token=${resetToken}`;

    try {
      const client = this.getClient();

      const { error } = await client.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: `Reset your ${this.appName} password`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">${this.appName}</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
              <h2 style="margin-top: 0; color: #1f2937;">Password Reset Request</h2>
              <p>Hi ${username},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Reset Password</a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
              <p style="color: #6b7280; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
              </p>
            </div>
          </body>
          </html>
        `,
        text: `
Hi ${username},

We received a request to reset your ${this.appName} password.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
        `.trim(),
      });

      if (error) {
        console.error('Failed to send password reset email:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(to: string, username: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('Email service not configured - RESEND_API_KEY not set');
      return false;
    }

    try {
      const client = this.getClient();

      const { error } = await client.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: `Your ${this.appName} password was changed`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">${this.appName}</h1>
            </div>
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
              <h2 style="margin-top: 0; color: #1f2937;">Password Changed</h2>
              <p>Hi ${username},</p>
              <p>Your password was successfully changed.</p>
              <p style="color: #6b7280; font-size: 14px;">If you didn't make this change, please contact support immediately.</p>
            </div>
          </body>
          </html>
        `,
        text: `
Hi ${username},

Your ${this.appName} password was successfully changed.

If you didn't make this change, please contact support immediately.
        `.trim(),
      });

      if (error) {
        console.error('Failed to send password changed email:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error sending password changed email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
