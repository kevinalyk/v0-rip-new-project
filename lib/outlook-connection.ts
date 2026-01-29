import { createTransport } from "nodemailer"
import Imap from "imap"

// Specialized Outlook connection handler
export class OutlookConnection {
  private email: string
  private password: string

  constructor(email: string, password: string) {
    this.email = email
    this.password = password
  }

  // Try multiple connection methods for Outlook
  async testConnection(): Promise<{ success: boolean; method?: string; error?: string; message?: string }> {
    const methods = [
      { name: "Nodemailer POP3", test: () => this.testNodemailerPOP3() },
      { name: "Nodemailer IMAP", test: () => this.testNodemailerIMAP() },
      { name: "Raw IMAP", test: () => this.testRawIMAP() },
    ]

    for (const method of methods) {
      try {
        console.log(`Testing ${method.name}...`)
        const result = await method.test()
        if (result.success) {
          return {
            success: true,
            method: method.name,
            message: result.message,
          }
        }
      } catch (error) {
        console.log(`${method.name} failed:`, error)
      }
    }

    return {
      success: false,
      error: "All connection methods failed for Outlook",
    }
  }

  private async testNodemailerPOP3(): Promise<{ success: boolean; message?: string }> {
    const transporter = createTransport({
      host: "pop-mail.outlook.com",
      port: 995,
      secure: true,
      auth: {
        user: this.email,
        pass: this.password,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
        ciphers: "HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    })

    await transporter.verify()
    return {
      success: true,
      message: "Successfully connected using Nodemailer with enhanced TLS for POP3",
    }
  }

  private async testNodemailerIMAP(): Promise<{ success: boolean; message?: string }> {
    const transporter = createTransport({
      host: "outlook.office365.com",
      port: 993,
      secure: true,
      auth: {
        user: this.email,
        pass: this.password,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: "TLSv1.2",
      },
    })

    await transporter.verify()
    return {
      success: true,
      message: "Successfully connected using Nodemailer IMAP",
    }
  }

  private async testRawIMAP(): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.email,
        password: this.password,
        host: "outlook.office365.com",
        port: 993,
        tls: true,
        tlsOptions: {
          rejectUnauthorized: false,
          minVersion: "TLSv1.2",
          servername: "outlook.office365.com",
        },
        authTimeout: 15000,
        connTimeout: 15000,
      })

      imap.once("error", (err: any) => {
        reject(err)
      })

      imap.once("ready", () => {
        imap.end()
        resolve({
          success: true,
          message: "Successfully connected using raw IMAP with enhanced TLS",
        })
      })

      imap.connect()

      setTimeout(() => {
        try {
          imap.end()
        } catch (e) {}
        reject(new Error("Connection timeout"))
      }, 15000)
    })
  }
}
