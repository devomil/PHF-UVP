declare module "google-trends-api" {
  interface TrendsOptions {
    keyword: string;
    geo?: string;
    startTime?: Date;
    endTime?: Date;
  }

  interface GoogleTrends {
    relatedQueries(options: TrendsOptions): Promise<string>;
    interestOverTime(options: TrendsOptions): Promise<string>;
    relatedTopics(options: TrendsOptions): Promise<string>;
  }

  const googleTrends: GoogleTrends;
  export default googleTrends;
}
