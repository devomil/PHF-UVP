export default function QrCodeHistory({ onSelectQrCode }: { onSelectQrCode?: (qr: any) => void }) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold">QR Code History</h2>
      <p className="text-gray-500 mt-2">Your QR code history will appear here.</p>
    </div>
  );
}
