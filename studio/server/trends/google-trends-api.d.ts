declare module 'google-trends-api' {
  interface BaseOptions {
    keyword?: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    property?: string;
    resolution?: string;
    granularTimeResolution?: boolean;
  }

  interface InterestOverTimeOptions extends BaseOptions {}
  interface InterestByRegionOptions extends BaseOptions {}
  interface RelatedQueriesOptions extends BaseOptions {}
  interface RelatedTopicsOptions extends BaseOptions {}
  interface DailyTrendsOptions {
    trendDate?: Date;
    geo?: string;
    hl?: string;
  }
  interface RealTimeTrendsOptions {
    geo?: string;
    hl?: string;
    category?: string;
  }
  interface AutoCompleteOptions {
    keyword: string;
    hl?: string;
  }

  function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  function interestByRegion(options: InterestByRegionOptions): Promise<string>;
  function relatedQueries(options: RelatedQueriesOptions): Promise<string>;
  function relatedTopics(options: RelatedTopicsOptions): Promise<string>;
  function dailyTrends(options: DailyTrendsOptions): Promise<string>;
  function realTimeTrends(options: RealTimeTrendsOptions): Promise<string>;
  function autoComplete(options: AutoCompleteOptions): Promise<string>;

  export {
    interestOverTime,
    interestByRegion,
    relatedQueries,
    relatedTopics,
    dailyTrends,
    realTimeTrends,
    autoComplete,
  };

  export default {
    interestOverTime,
    interestByRegion,
    relatedQueries,
    relatedTopics,
    dailyTrends,
    realTimeTrends,
    autoComplete,
  };
}

