import nodemailer, {Transporter} from 'nodemailer';
import { __dirname } from '../app.js';

class EmailHandler {
    /** the object that will send emails */
    private readonly supportEmailAddress:string = 'support@rosegoldgardens.com';
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

    /** Use this when you want to send the user a confirmation email upon signup
     * @param newUsersEmail - the email of the user seeking verification
     * @param userInformationHash - the hash value of the user's information that will be used for authenticity 
     */
    registrationConfirmationEmail(newUsersEmail: string, userInformationHash: string): Promise<any> {
        return this.transporter.sendMail({
            from: `"Rose Gold Market" <${this.supportEmailAddress}>`,
            to: newUsersEmail,
            subject:'Welcome to the Market!',
            html: `<img src="cid:RoseGoldBanner" style="width:100%"/>
            <h1 style="text-align:center;font-size:1.5em;">Congratulations!</h1>
            <p style="font-size:1em;text-align:center;">Your <strong>RoseGold Gardens</strong> account has been created. Remember, you will be signing in with your email address and the password you just created. This link is only valid for 24 hours, so please verify quickly.</p>
            <p style="font-size:1em;text-align:center;">If you did not initiate this account registration please contact us our support team at <a href="mailto:${this.supportEmailAddress}">${this.supportEmailAddress}</p>
            <div style="text-align:center;">
            <a href="https://www.rosegoldgardens.com/success/?emailAddress=${newUsersEmail}&userInformation=${userInformationHash}" style="padding:15px;background-color:#0690de;color:white;display:inline-block;border-radius:15px;text-decoration:none;font-size:2em;">Confirm Account</a>
            </div>
            `,
            attachments: [{
                filename: "Banner.jpg",
                path: `${__dirname}/images/companyAssets/Banner.jpg`,
                cid: 'RoseGoldBanner'
            }]
        });
    }

    /** use this when you want to relay a message from the users to the rose gold staff */
    emailSupport(from: string, subject: string, text: string): Promise<any> {
        return this.transporter.sendMail({
            from,
            to: this.supportEmailAddress,
            subject,
            text
        });
    }
}

export const emailHandler:EmailHandler = EmailHandler.EmailHandlerInstance;