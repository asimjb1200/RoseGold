import axios from 'axios';
import nodemailer, {Transporter} from 'nodemailer';

class EmailHandler {
    /** the object that will send emails */
    private readonly supportEmailAddress:string = '';
    private readonly transporter: Transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.GMAILUSERNAME!,
            pass: process.env.GMAILPASSWORD!
        }
    });

    private static emailerInstance:EmailHandler;

    public static get EmailHandlerInstance(): EmailHandler {
        return this.emailerInstance || (this.emailerInstance = new this());
    }

    /** use this when you want to send a message from the rose gold team to the users */
    emailUser(to: string, subject: string, text: string): Promise<any> {
        return this.transporter.sendMail({
            from: `"Rose Gold Market" <${this.supportEmailAddress}>`,
            to,
            subject,
            html: text
        });
    }

    /** use this when you want to relay a message from the users to the rose gold staff */
    emailSupport(to: string, from: string, subject: string, text: string): Promise<any> {
        return this.transporter.sendMail({
            from,
            to: this.supportEmailAddress,
            subject,
            text
        });
    }
}

export const emailHandler:EmailHandler = EmailHandler.EmailHandlerInstance;