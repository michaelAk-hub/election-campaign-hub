import React, { useState } from 'react';
import SystemDocumentation from '../components/documentation/SystemDocumentation';
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Documentation() {
    const [downloading, setDownloading] = useState(false);

    const handleDownloadPDF = async () => {
        try {
            setDownloading(true);
            const { data } = await base44.functions.invoke('generateDocumentationPDF');
            
            const blob = new Blob([data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Τεκμηρίωση_Συστήματος_Εκλογών_2026.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
            console.error('PDF download error:', error);
            alert('Σφάλμα κατά τη λήψη του PDF');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div>
            <div className="mb-6 flex justify-end">
                <Button 
                    onClick={handleDownloadPDF}
                    disabled={downloading}
                    className="gap-2"
                >
                    {downloading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Δημιουργία PDF...
                        </>
                    ) : (
                        <>
                            <Download className="h-4 w-4" />
                            Λήψη ως PDF
                        </>
                    )}
                </Button>
            </div>
            <SystemDocumentation />
        </div>
    );
}