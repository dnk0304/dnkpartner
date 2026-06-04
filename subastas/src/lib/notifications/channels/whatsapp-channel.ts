/**
 * WhatsApp Channel
 * Uses Baileys library for WhatsApp Web integration (free)
 */

import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import path from 'path';
import { Boom } from '@hapi/boom';

export class WhatsAppChannel {
  private sock: any = null;
  private isConnected = false;
  private authPath = path.join(process.cwd(), 'data', 'whatsapp-session');
  
  /**
   * Initialize WhatsApp connection
   */
  async initialize() {
    if (this.isConnected) {
      return;
    }
    
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
      
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // Show QR code for first-time auth
      });
      
      // Handle connection updates
      this.sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          console.log('WhatsApp QR Code:');
          console.log(qr);
        }
        
        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('WhatsApp connection closed. Reconnecting:', shouldReconnect);
          
          if (shouldReconnect) {
            this.initialize(); // Reconnect
          }
        } else if (connection === 'open') {
          console.log('WhatsApp connected successfully');
          this.isConnected = true;
        }
      });
      
      // Save credentials when updated
      this.sock.ev.on('creds.update', saveCreds);
      
    } catch (error) {
      console.error('Failed to initialize WhatsApp:', error);
      throw error;
    }
  }
  
  /**
   * Send a message to a phone number
   */
  async sendMessage(phone: string, message: string): Promise<boolean> {
    if (!this.isConnected) {
      await this.initialize();
    }
    
    try {
      // Format phone number (must be in international format)
      const formattedPhone = this.formatPhoneNumber(phone);
      
      await this.sock.sendMessage(formattedPhone, {
        text: message
      });
      
      console.log(`WhatsApp message sent to ${phone}`);
      return true;
    } catch (error) {
      console.error(`Failed to send WhatsApp message to ${phone}:`, error);
      return false;
    }
  }
  
  /**
   * Send auction alert via WhatsApp
   */
  async sendAuctionAlert(phone: string, auction: any): Promise<boolean> {
    const message = this.formatAuctionMessage(auction);
    return this.sendMessage(phone, message);
  }
  
  /**
   * Format phone number to WhatsApp ID
   */
  private formatPhoneNumber(phone: string): string {
    // Remove spaces, dashes, parentheses
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Add Spain country code if not present
    if (!cleaned.startsWith('+') && !cleaned.startsWith('34')) {
      cleaned = '34' + cleaned;
    }
    
    // Remove + if present
    cleaned = cleaned.replace('+', '');
    
    // Return in WhatsApp format: "34612345678@s.whatsapp.net"
    return `${cleaned}@s.whatsapp.net`;
  }
  
  /**
   * Format auction data into WhatsApp message
   */
  private formatAuctionMessage(auction: any): string {
    return `
🏛️ *SubastasActivas - Nueva Subasta*

📋 ${auction.title}
💰 Valor: ${this.formatCurrency(auction.appraisalValue)}
📍 ${auction.municipality || ''}, ${auction.province}

🔗 Ver detalles: ${process.env.NEXT_PUBLIC_URL || 'https://subastasactivas.com'}/auction/${auction.id}
    `.trim();
  }
  
  private formatCurrency(amount: number | null): string {
    if (amount === null || Number.isNaN(amount)) {
      return 'Sin tasación';
    }
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);
  }
}

// Export singleton
let whatsappChannel: WhatsAppChannel | null = null;

export async function getWhatsAppChannel(): Promise<WhatsAppChannel> {
  if (!whatsappChannel) {
    whatsappChannel = new WhatsAppChannel();
    await whatsappChannel.initialize();
  }
  return whatsappChannel;
}
