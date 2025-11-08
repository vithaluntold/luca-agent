import { spawn } from 'child_process';
import { storage } from '../pgStorage';
import fs from 'fs/promises';

export interface VirusScanResult {
  clean: boolean;
  infected: boolean;
  details?: string;
  threats?: string[];
}

/**
 * Virus Scanning Service
 * Supports multiple scanning engines: ClamAV, VirusTotal, AWS GuardDuty
 */
export class VirusScanService {
  private static scanProvider: 'clamav' | 'virustotal' | 'aws' = 
    (process.env.VIRUS_SCAN_PROVIDER as any) || 'clamav';

  /**
   * Scan a file for viruses
   */
  static async scanFile(filePath: string): Promise<VirusScanResult> {
    try {
      switch (this.scanProvider) {
        case 'clamav':
          return await this.scanWithClamAV(filePath);
        case 'virustotal':
          return await this.scanWithVirusTotal(filePath);
        case 'aws':
          return await this.scanWithAWS(filePath);
        default:
          console.warn(`Unknown scan provider: ${this.scanProvider}, defaulting to ClamAV`);
          return await this.scanWithClamAV(filePath);
      }
    } catch (error) {
      console.error('Virus scan failed:', error);
      return {
        clean: false,
        infected: false,
        details: `Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Scan file using ClamAV (clamscan command)
   */
  private static async scanWithClamAV(filePath: string): Promise<VirusScanResult> {
    return new Promise((resolve, reject) => {
      // Check if file exists
      fs.access(filePath).catch(() => {
        return resolve({
          clean: false,
          infected: false,
          details: 'File not found'
        });
      });

      const clamscan = spawn('clamscan', ['--no-summary', filePath]);
      let stdout = '';
      let stderr = '';

      clamscan.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      clamscan.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      clamscan.on('close', (code) => {
        // ClamAV exit codes: 0 = clean, 1 = infected, 2 = error
        if (code === 0) {
          resolve({
            clean: true,
            infected: false,
            details: 'File is clean'
          });
        } else if (code === 1) {
          // Extract virus names from output
          const threats = stdout.match(/FOUND$/gm)?.map(line => 
            line.split(':')[1]?.trim()
          ).filter(Boolean) || [];
          
          resolve({
            clean: false,
            infected: true,
            details: stdout.trim(),
            threats
          });
        } else {
          // ClamAV not installed or error
          console.warn('ClamAV scan error:', stderr);
          resolve({
            clean: false,
            infected: false,
            details: `ClamAV error (code ${code}): ${stderr || 'ClamAV may not be installed'}`
          });
        }
      });

      clamscan.on('error', (error) => {
        console.error('ClamAV spawn error:', error);
        resolve({
          clean: false,
          infected: false,
          details: 'ClamAV not available. Please install ClamAV or configure alternative scan provider.'
        });
      });
    });
  }

  /**
   * Scan file using VirusTotal API (requires API key)
   */
  private static async scanWithVirusTotal(filePath: string): Promise<VirusScanResult> {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    
    if (!apiKey) {
      return {
        clean: false,
        infected: false,
        details: 'VirusTotal API key not configured'
      };
    }

    try {
      const fileBuffer = await fs.readFile(filePath);
      const formData = new FormData();
      formData.append('file', new Blob([fileBuffer]));

      // Upload file
      const uploadResponse = await fetch('https://www.virustotal.com/api/v3/files', {
        method: 'POST',
        headers: {
          'x-apikey': apiKey
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error(`VirusTotal upload failed: ${uploadResponse.statusText}`);
      }

      const uploadData = await uploadResponse.json();
      const analysisId = uploadData.data.id;

      // Wait and check analysis results (polling with timeout)
      let attempts = 0;
      while (attempts < 30) { // Max 5 minutes
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        const analysisResponse = await fetch(
          `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
          {
            headers: { 'x-apikey': apiKey }
          }
        );

        const analysisData = await analysisResponse.json();
        
        if (analysisData.data.attributes.status === 'completed') {
          const stats = analysisData.data.attributes.stats;
          const malicious = stats.malicious || 0;
          
          return {
            clean: malicious === 0,
            infected: malicious > 0,
            details: `Scanned by ${stats.harmless + stats.undetected + malicious} engines. ${malicious} detected threats.`,
            threats: malicious > 0 ? [`Detected by ${malicious} engines`] : undefined
          };
        }
        
        attempts++;
      }

      return {
        clean: false,
        infected: false,
        details: 'VirusTotal scan timeout'
      };
    } catch (error) {
      return {
        clean: false,
        infected: false,
        details: `VirusTotal scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Scan file using AWS GuardDuty Malware Protection
   * Note: This is a placeholder - actual implementation requires AWS SDK setup
   */
  private static async scanWithAWS(filePath: string): Promise<VirusScanResult> {
    // This would require AWS SDK and S3 bucket setup
    return {
      clean: false,
      infected: false,
      details: 'AWS GuardDuty integration not yet implemented. Please use ClamAV or VirusTotal.'
    };
  }

  /**
   * Background job to scan all pending files
   */
  static async scanPendingFiles(): Promise<void> {
    try {
      const pendingFiles = await storage.getTaxFilesByStatus('pending');
      
      console.log(`Starting virus scan for ${pendingFiles.length} pending files...`);
      
      for (const file of pendingFiles) {
        try {
          // Update to scanning status
          await storage.updateTaxFileStatus(file.id, 'scanning', null);
          
          // Scan the file
          const result = await this.scanFile(file.storageKey);
          
          // Update status based on result
          if (result.clean) {
            await storage.updateTaxFileStatus(file.id, 'clean', {
              scannedAt: new Date().toISOString(),
              scanProvider: this.scanProvider,
              details: result.details
            });
            console.log(`✓ File ${file.id} is clean`);
          } else if (result.infected) {
            await storage.updateTaxFileStatus(file.id, 'infected', {
              scannedAt: new Date().toISOString(),
              scanProvider: this.scanProvider,
              threats: result.threats,
              details: result.details
            });
            console.warn(`⚠ File ${file.id} is INFECTED:`, result.threats);
            
            // TODO: Alert admins about infected file
            // TODO: Quarantine or delete infected file
          } else {
            // Scan failed
            await storage.updateTaxFileStatus(file.id, 'failed', {
              scannedAt: new Date().toISOString(),
              scanProvider: this.scanProvider,
              details: result.details
            });
            console.error(`✗ Scan failed for file ${file.id}:`, result.details);
          }
        } catch (error) {
          console.error(`Error scanning file ${file.id}:`, error);
          await storage.updateTaxFileStatus(file.id, 'failed', {
            scannedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      console.log('Virus scanning complete');
    } catch (error) {
      console.error('Error in scanPendingFiles:', error);
    }
  }

  /**
   * Start periodic scanning of pending files
   */
  static startPeriodicScanning(intervalMinutes: number = 5): NodeJS.Timeout {
    console.log(`Starting periodic virus scanning every ${intervalMinutes} minutes...`);
    
    // Run immediately
    this.scanPendingFiles();
    
    // Then run periodically
    return setInterval(() => {
      this.scanPendingFiles();
    }, intervalMinutes * 60 * 1000);
  }
}
