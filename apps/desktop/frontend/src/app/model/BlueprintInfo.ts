export interface BlueprintInfo {
  md5Hash: string;
  lastPlayed: Date;
  title: string;
  artist: string;
  creator: string;
  folderName: string;
  audioFileName: string;
  osuFileName: string;

  bgFileName?: string;
}
