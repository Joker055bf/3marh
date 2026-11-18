import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const shareFile = async (blob: Blob, fileName: string, title: string) => {
    try {
        // Convert Blob to Base64
        const reader = new FileReader();
        reader.readAsDataURL(blob);

        reader.onloadend = async () => {
            const base64data = reader.result as string;
            // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
            const base64Content = base64data.split(',')[1];

            // Sanitize filename to ensure it's safe for file system and sharing
            const safeFileName = `document_${Date.now()}.pdf`;

            try {
                // Write the file to the cache directory
                const result = await Filesystem.writeFile({
                    path: safeFileName,
                    data: base64Content,
                    directory: Directory.Cache,
                });

                // Share the file using the 'files' option which is meant for local files
                await Share.share({
                    title: title,
                    files: [result.uri],
                });
            } catch (e) {
                console.error('Error writing or sharing file:', e);
                throw e;
            }
        };

        reader.onerror = (error) => {
            console.error('Error reading blob:', error);
            throw error;
        };

    } catch (error) {
        console.error('Share failed:', error);
        throw error;
    }
};
