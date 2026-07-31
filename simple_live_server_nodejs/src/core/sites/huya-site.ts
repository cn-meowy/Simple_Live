/**
 * 虎牙直播平台适配
 *
 * 对应 Dart 版 simple_live_core/lib/src/huya_site.dart
 */

import { createHash } from 'node:crypto';
import { LiveSite } from '../interface/live-site.js';
import { LiveDanmaku } from '../interface/live-danmaku.js';
import { LiveCategory, LiveSubCategory } from '../model/live-category.js';
import { LiveCategoryResult } from '../model/live-category-result.js';
import { LiveSearchRoomResult, LiveSearchAnchorResult } from '../model/live-search-result.js';
import { LiveRoomDetail } from '../model/live-room-detail.js';
import { LivePlayQuality } from '../model/live-play-quality.js';
import { LivePlayUrl } from '../model/live-play-url.js';
import { LiveRoomItem } from '../model/live-room-item.js';
import { LiveAnchorItem } from '../model/live-anchor-item.js';
import { LiveSuperChatMessage } from '../model/live-message.js';
import { HttpClient } from '../common/http-client.js';
import { BaseTarsHttp } from '../tars/tars-http.js';
import { HuyaUserId, GetCdnTokenExReq, GetCdnTokenExResp } from '../tars/models/huya-models.js';
import { HuyaDanmaku } from '../danmaku/huya-danmaku.js';

const BASE_URL = 'https://m.huya.com/';
const UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36 Edg/117.0.0.0';
const HYSDK_UA = 'HYSDK(Windows, 30000002)_APP(pc_exe&7060000&official)_SDK(trans&2.32.3.5646)';

export class HuyaDanmakuArgs {
  constructor(public readonly ayyuid: number, public readonly topSid: number, public readonly subSid: number) {}
  toJSON(): Record<string, unknown> { return { ayyuid: this.ayyuid, topSid: this.topSid, subSid: this.subSid }; }
}

export enum HuyaLineType { flv = 'flv', hls = 'hls' }

export class HuyaLineModel {
  constructor(
    public readonly line: string, public readonly lineType: HuyaLineType,
    public readonly flvAntiCode: string, public readonly hlsAntiCode: string,
    public readonly streamName: string, public readonly cdnType: string,
    public bitRate = 0, public readonly presenterUid = 0,
  ) {}
  toString(): string { return JSON.stringify({ line: this.line, cdnType: this.cdnType, flvAntiCode: this.flvAntiCode, hlsAntiCode: this.hlsAntiCode, streamName: this.streamName, lineType: this.lineType, presenterUid: this.presenterUid }); }
}

export class HuyaBitRateModel {
  constructor(public readonly name: string, public readonly bitRate: number) {}
  toString(): string { return JSON.stringify({ name: this.name, bitRate: this.bitRate }); }
}

export class HuyaUrlDataModel {
  constructor(public readonly url: string, public readonly uid: string, public lines: HuyaLineModel[], public bitRates: HuyaBitRateModel[]) {}
  toString(): string { return JSON.stringify({ url: this.url, uid: this.uid, lines: this.lines.map(e => e.toString()), bitRates: this.bitRates.map(e => e.toString()) }); }
}

export class HuyaSite extends LiveSite {
  id = 'huya';
  name = '虎牙直播';

  private readonly tupClient = new BaseTarsHttp('http://wup.huya.com', 'liveui', { headers: { Origin: BASE_URL, Referer: BASE_URL, 'User-Agent': HYSDK_UA } });

  getDanmaku(): LiveDanmaku { return new HuyaDanmaku(); }

  async getCategores(): Promise<LiveCategory[]> {
    const categories = [new LiveCategory('1', '网游', []), new LiveCategory('2', '单机', []), new LiveCategory('8', '娱乐', []), new LiveCategory('3', '手游', [])];
    for (const cat of categories) cat.children.push(...await this.getSubCategores(cat.id));
    return categories;
  }

  private async getSubCategores(id: string): Promise<LiveSubCategory[]> {
    const result = await HttpClient.instance.getJson('https://live.cdn.huya.com/liveconfig/game/bussLive', { queryParameters: { bussType: id } });
    return (result['data'] ?? []).map((item: any) => {
      let gid = '';
      if (item['gid'] && typeof item['gid'] === 'object' && !Array.isArray(item['gid'])) gid = String(item['gid']['value']).split(',')[0];
      else gid = String(item['gid']);
      return new LiveSubCategory(gid, String(item['gameFullName']), id, `https://huyaimg.msstatic.com/cdnimage/game/${gid}-MS.jpg`);
    });
  }

  async getCategoryRooms(category: LiveSubCategory, page = 1): Promise<LiveCategoryResult> {
    const rt = await HttpClient.instance.getJson('https://www.huya.com/cache.php', { queryParameters: { m: 'LiveList', do: 'getLiveListByPage', tagAll: 0, gameId: category.id, page } });
    const result = typeof rt === 'string' ? JSON.parse(rt) : rt;
    const items = (result['data']['datas'] ?? []).map((item: any) => this.parseRoomItem(item));
    return new LiveCategoryResult(result['data']['page'] < result['data']['totalPage'], items);
  }

  async getPlayQualites(detail: LiveRoomDetail): Promise<LivePlayQuality[]> {
    const urlData = detail.data as HuyaUrlDataModel;
    if (urlData.bitRates.length === 0) urlData.bitRates = [new HuyaBitRateModel('原画', 0), new HuyaBitRateModel('高清', 2000)];
    return urlData.bitRates.map((item) => new LivePlayQuality(item.name, { urls: urlData.lines, bitRate: item.bitRate }));
  }

  async getPlayUrls(_detail: LiveRoomDetail, quality: LivePlayQuality): Promise<LivePlayUrl> {
    const qData = quality.data as { urls: HuyaLineModel[]; bitRate: number };
    const urls: string[] = [];
    for (const line of qData.urls) urls.push(await this.getPlayUrl(line, qData.bitRate));
    return new LivePlayUrl(urls, { 'user-agent': HYSDK_UA });
  }

  private async getPlayUrl(line: HuyaLineModel, bitRate: number): Promise<string> {
    const antiCode = await this.getCdnTokenInfoEx(line.streamName);
    const built = this.buildAntiCode(line.streamName, line.presenterUid, antiCode);
    let url = `${line.line}/${line.streamName}.flv?${built}&codec=264`;
    if (bitRate > 0) url += `&ratio=${bitRate}`;
    return url;
  }

  private buildAntiCode(stream: string, presenterUid: number, antiCode: string): string {
    const params = new URLSearchParams(antiCode);
    if (!params.has('fm')) return antiCode;
    const ctype = params.get('ctype') ?? 'huya_pc_exe';
    const platformId = parseInt(params.get('t') ?? '0');
    const isWap = platformId === 103;
    const clacStartTime = Date.now();
    const seqId = presenterUid + clacStartTime;
    const secretHash = createHash('md5').update(`${seqId}|${ctype}|${platformId}`).digest('hex');
    const convertUid = this.rotl64(presenterUid);
    const calcUid = isWap ? presenterUid : convertUid;
    const fm = decodeURIComponent(params.get('fm')!);
    const secretPrefix = Buffer.from(fm, 'base64').toString('utf-8').split('_')[0];
    const wsTime = params.get('wsTime')!;
    const wsSecret = createHash('md5').update(`${secretPrefix}_${calcUid}_${stream}_${secretHash}_${wsTime}`).digest('hex');
    const ct = Math.floor((parseInt(wsTime, 16) + Math.random()) * 1000);
    const uuid = String(Math.floor(((ct % 1e10) + Math.random()) * 1e3 % 0xffffffff));
    const result: Record<string, string> = { wsSecret, wsTime, seqid: String(seqId), ctype, ver: '1', fs: params.get('fs')!, fm: encodeURIComponent(params.get('fm')!), t: String(platformId) };
    if (isWap) { result['uid'] = String(presenterUid); result['uuid'] = uuid; }
    else { result['u'] = String(convertUid); }
    return Object.entries(result).map(([k, v]) => `${k}=${v}`).join('&');
  }

  private async getCdnTokenInfoEx(stream: string): Promise<string> {
    const tid = new HuyaUserId();
    tid.sHuYaUA = 'pc_exe&7060000&official';
    const tReq = new GetCdnTokenExReq();
    tReq.tId = tid;
    tReq.sStreamName = stream;
    const resp = await this.tupClient.tupRequest('getCdnTokenInfoEx', tReq, new GetCdnTokenExResp());
    return resp.sFlvToken;
  }

  async getRecommendRooms(page = 1): Promise<LiveCategoryResult> {
    const rt = await HttpClient.instance.getJson('https://www.huya.com/cache.php', { queryParameters: { m: 'LiveList', do: 'getLiveListByPage', tagAll: 0, page } });
    const result = typeof rt === 'string' ? JSON.parse(rt) : rt;
    const items = (result['data']['datas'] ?? []).map((item: any) => this.parseRoomItem(item));
    return new LiveCategoryResult(result['data']['page'] < result['data']['totalPage'], items);
  }

  private parseRoomItem(item: any): LiveRoomItem {
    let cover = String(item['screenshot'] ?? '');
    if (!cover.includes('?')) cover += '?x-oss-process=style/w338_h190&';
    const title = String(item['introduction'] ?? '') || String(item['roomName'] ?? '');
    return new LiveRoomItem(String(item['profileRoom']), title, cover, String(item['nick']), parseInt(String(item['totalCount'])) || 0);
  }

  async getRoomDetail(roomId: string): Promise<LiveRoomDetail> {
    const roomInfo = await this.getRoomInfo(roomId);
    const tLiveInfo = roomInfo['roomInfo']['tLiveInfo'];
    const tProfileInfo = roomInfo['roomInfo']['tProfileInfo'];
    const title = String(tLiveInfo['sIntroduction'] ?? '') || String(tLiveInfo['sRoomName'] ?? '');
    const huyaLines: HuyaLineModel[] = [];
    for (const item of tLiveInfo['tLiveStreamInfo']['vStreamInfo']['value'] ?? []) {
      if (String(item['sFlvUrl'] ?? '')) huyaLines.push(new HuyaLineModel(String(item['sFlvUrl']), HuyaLineType.flv, String(item['sFlvAntiCode']), String(item['sHlsAntiCode']), String(item['sStreamName']), String(item['sCdnType']), 0, roomInfo['topSid'] ?? 0));
    }
    const huyaBiterates: HuyaBitRateModel[] = [];
    for (const item of tLiveInfo['tLiveStreamInfo']['vBitRateInfo']['value'] ?? []) {
      const name = String(item['sDisplayName']);
      if (!name.includes('HDR')) huyaBiterates.push(new HuyaBitRateModel(name, item['iBitRate']));
    }
    return new LiveRoomDetail(
      String(tLiveInfo['lProfileRoom']), title, String(tLiveInfo['sScreenshot']),
      String(tProfileInfo['sNick']), String(tProfileInfo['sAvatar180']),
      tLiveInfo['lTotalCount'] ?? 0, roomInfo['roomInfo']['eLiveStatus'] === 2,
      `https://www.huya.com/${roomId}`,
      new HuyaUrlDataModel(`https:${Buffer.from(roomInfo['roomProfile']['liveLineUrl'], 'base64').toString('utf-8')}`, this.getUid(13, 10), huyaLines, huyaBiterates),
      new HuyaDanmakuArgs(tLiveInfo['lYyid'] ?? 0, roomInfo['topSid'] ?? 0, roomInfo['subSid'] ?? 0),
      String(tLiveInfo['sIntroduction']), String(roomInfo['welcomeText']),
      false, undefined,
    );
  }

  private async getRoomInfo(roomId: string): Promise<any> {
    const resultText = await HttpClient.instance.getText(`https://m.huya.com/${roomId}`, { header: { 'user-agent': UA } });
    const text = resultText.match(/window\.HNF_GLOBAL_INIT.=.\{[\s\S]*?\}[\s\S]*?<\/script>/)?.[0] ?? '';
    const jsonText = text.replace(/window\.HNF_GLOBAL_INIT.=./, '').replace(/<\/script>/, '').replace(/function.*?\(.*?\).\{[\s\S]*?\}/g, '""');
    const jsonObj = JSON.parse(jsonText);
    jsonObj['topSid'] = parseInt(resultText.match(/lChannelId":([0-9]+)/)?.[1] ?? '0');
    jsonObj['subSid'] = parseInt(resultText.match(/lSubChannelId":([0-9]+)/)?.[1] ?? '0');
    return jsonObj;
  }

  async searchRooms(keyword: string, page = 1): Promise<LiveSearchRoomResult> {
    const rt = await HttpClient.instance.getJson('https://search.cdn.huya.com/', { queryParameters: { m: 'Search', do: 'getSearchContent', q: keyword, uid: 0, v: 4, typ: -5, livestate: 0, rows: 20, start: (page - 1) * 20 } });
    const result = typeof rt === 'string' ? JSON.parse(rt) : rt;
    const items = (result['response']['3']['docs'] ?? []).map((item: any) => {
      let cover = String(item['game_screenshot'] ?? '');
      if (!cover.includes('?')) cover += '?x-oss-process=style/w338_h190&';
      return new LiveRoomItem(String(item['room_id']), String(item['game_introduction'] ?? '') || String(item['game_roomName'] ?? ''), cover, String(item['game_nick']), parseInt(String(item['game_total_count'])) || 0);
    });
    return new LiveSearchRoomResult(result['response']['3']['numFound'] > page * 20, items);
  }

  async searchAnchors(keyword: string, page = 1): Promise<LiveSearchAnchorResult> {
    const rt = await HttpClient.instance.getJson('https://search.cdn.huya.com/', { queryParameters: { m: 'Search', do: 'getSearchContent', q: keyword, uid: 0, v: 1, typ: -5, livestate: 0, rows: 20, start: (page - 1) * 20 } });
    const result = typeof rt === 'string' ? JSON.parse(rt) : rt;
    const items = (result['response']['1']['docs'] ?? []).map((item: any) => new LiveAnchorItem(String(item['room_id']), String(item['game_nick']), String(item['game_avatarUrl180']), item['gameLiveOn']));
    return new LiveSearchAnchorResult(result['response']['1']['numFound'] > page * 20, items);
  }

  async getLiveStatus(roomId: string): Promise<boolean> {
    const roomInfo = await this.getRoomInfo(roomId);
    return roomInfo['roomInfo']['eLiveStatus'] === 2;
  }

  async getSuperChatMessage(_roomId: string): Promise<LiveSuperChatMessage[]> { return []; }

  private rotl64(t: number): number {
    const low = t & 0xFFFFFFFF;
    const rotatedLow = ((low << 8) | (low >>> 24)) & 0xFFFFFFFF;
    const high = t & ~0xFFFFFFFF;
    return high | rotatedLow;
  }

  private getUid(t?: number, e?: number): string {
    const n = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
    const o: string[] = new Array(36).fill('');
    if (t) {
      for (let i = 0; i < t; i++) o[i] = n[Math.floor(Math.random() * (e ?? n.length))];
    } else {
      o[8] = o[13] = o[18] = o[23] = '-';
      o[14] = '4';
      for (let i = 0; i < 36; i++) {
        if (o[i] === '') {
          const r = Math.floor(Math.random() * 16);
          o[i] = n[i === 19 ? (3 & r) | 8 : r];
        }
      }
    }
    return o.join('');
  }
}
