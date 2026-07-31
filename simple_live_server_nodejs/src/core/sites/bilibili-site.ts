/**
 * B站直播平台适配
 *
 * 对应 Dart 版 simple_live_core/lib/src/bilibili_site.dart
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
import { CoreLog } from '../common/core-log.js';
import { asNumber, asString } from '../common/convert-helper.js';
import { BiliBiliDanmaku } from '../danmaku/bilibili-danmaku.js';

/** B站弹幕参数 */
export class BiliBiliDanmakuArgs {
  constructor(
    public readonly roomId: number,
    public readonly token: string,
    public readonly serverHost: string,
    public readonly buvid: string,
    public readonly uid: number,
    public readonly cookie: string,
  ) {}

  toJSON(): Record<string, unknown> {
    return { roomId: this.roomId, token: this.token, serverHost: this.serverHost, buvid: this.buvid, uid: this.uid, cookie: this.cookie };
  }
}

export class BiliBiliSite extends LiveSite {
  id = 'bilibili';
  name = '哔哩哔哩直播';
  cookie = '';
  userId = 0;

  private static readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
  private static readonly REFERER = 'https://live.bilibili.com/';
  private static readonly mixinKeyEncTab = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  private static kImgKey = '';
  private static kSubKey = '';

  private buvid3 = '';
  private buvid4 = '';
  private accessId = '';

  getDanmaku(): LiveDanmaku {
    return new BiliBiliDanmaku();
  }

  private async getHeader(): Promise<Record<string, string>> {
    if (this.buvid3 === '') {
      const info = await this.getBuvid();
      this.buvid3 = info['b_3'] ?? '';
      this.buvid4 = info['b_4'] ?? '';
    }
    if (this.cookie === '') {
      return { 'user-agent': BiliBiliSite.UA, referer: BiliBiliSite.REFERER, cookie: `buvid3=${this.buvid3};buvid4=${this.buvid4};` };
    }
    const cookie = this.cookie.includes('buvid3') ? this.cookie : `${this.cookie};buvid3=${this.buvid3};buvid4=${this.buvid4};`;
    return { cookie, 'user-agent': BiliBiliSite.UA, referer: BiliBiliSite.REFERER };
  }

  async getCategores(): Promise<LiveCategory[]> {
    const categories: LiveCategory[] = [];
    const result = await HttpClient.instance.getJson('https://api.live.bilibili.com/room/v1/Area/getList', { queryParameters: { need_entrance: 1, parent_id: 0 }, header: await this.getHeader() });
    for (const item of result['data'] ?? []) {
      const subs: LiveSubCategory[] = [];
      for (const sub of item['list'] ?? []) {
        subs.push(new LiveSubCategory(String(sub['id']), asString(sub['name']), asString(sub['parent_id']), `${asString(sub['pic'])}@100w.png`));
      }
      categories.push(new LiveCategory(String(item['id']), asString(item['name']), subs));
    }
    return categories;
  }

  async getCategoryRooms(category: LiveSubCategory, page = 1): Promise<LiveCategoryResult> {
    const baseUrl = 'https://api.live.bilibili.com/xlive/web-interface/v1/second/getList';
    const url = `${baseUrl}?platform=web&parent_area_id=${category.parentId}&area_id=${category.id}&sort_type=&page=${page}&w_webid=${await this.getAccessId()}`;
    const wbiSign = await this.getWbiSign(url);
    CoreLog.i(`[BiliBiliSite.getCategoryRooms] 请求URL=${url}`);
    CoreLog.i(`[BiliBiliSite.getCategoryRooms] 签名参数=${JSON.stringify(wbiSign)}`);
    const result = await HttpClient.instance.getJson(baseUrl, { queryParameters: wbiSign, header: await this.getHeader() });
    CoreLog.i(`[BiliBiliSite.getCategoryRooms] 上游返回=${JSON.stringify(result)}`);
    if (result == null || result['data'] == null) {
      CoreLog.w(`[BiliBiliSite.getCategoryRooms] data为空, code=${result?.['code']}, message=${result?.['message']}`);
      return new LiveCategoryResult(false, []);
    }
    const hasMore = result['data']['has_more'] === 1;
    const items: LiveRoomItem[] = (result['data']['list'] ?? []).map((item: any) => new LiveRoomItem(String(item['roomid']), String(item['title']), `${item['cover']}@400w.jpg`, String(item['uname']), parseInt(String(item['online'])) || 0));
    return new LiveCategoryResult(hasMore, items);
  }

  async getPlayQualites(detail: LiveRoomDetail): Promise<LivePlayQuality[]> {
    const result = await HttpClient.instance.getJson('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo', { queryParameters: { room_id: detail.roomId, protocol: '0,1', format: '0,1,2', codec: '0,1', platform: 'web' }, header: await this.getHeader() });
    const qMap = new Map<number, string>();
    for (const item of result['data']['playurl_info']['playurl']['g_qn_desc'] ?? []) {
      qMap.set(parseInt(String(item['qn'])) || 0, String(item['desc']));
    }
    const qualities: LivePlayQuality[] = [];
    for (const item of result['data']['playurl_info']['playurl']['stream'][0]['format'][0]['codec'][0]['accept_qn'] ?? []) {
      qualities.push(new LivePlayQuality(qMap.get(item) ?? '未知清晰度', item));
    }
    return qualities;
  }

  async getPlayUrls(detail: LiveRoomDetail, quality: LivePlayQuality): Promise<LivePlayUrl> {
    const result = await HttpClient.instance.getJson('https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo', { queryParameters: { room_id: detail.roomId, protocol: '0,1', format: '0,2', codec: '0', platform: 'web', qn: quality.data as number }, header: await this.getHeader() });
    const urls: string[] = [];
    for (const stream of result['data']['playurl_info']['playurl']['stream'] ?? []) {
      for (const fmt of stream['format'] ?? []) {
        for (const codec of fmt['codec'] ?? []) {
          const base = String(codec['base_url']);
          for (const ui of codec['url_info'] ?? []) {
            urls.push(`${ui['host']}${base}${ui['extra']}`);
          }
        }
      }
    }
    urls.sort((a) => (a.includes('mcdn') ? 1 : -1));
    return new LivePlayUrl(urls, { referer: 'https://live.bilibili.com', 'user-agent': BiliBiliSite.UA });
  }

  async getRecommendRooms(page = 1): Promise<LiveCategoryResult> {
    const baseUrl = 'https://api.live.bilibili.com/xlive/web-interface/v1/second/getListByArea';
    const url = `${baseUrl}?platform=web&sort=online&page_size=30&page=${page}`;
    const result = await HttpClient.instance.getJson(baseUrl, { queryParameters: await this.getWbiSign(url), header: await this.getHeader() });
    const list = result['data']['list'] ?? [];
    const items: LiveRoomItem[] = list.map((item: any) => new LiveRoomItem(String(item['roomid']), String(item['title']), `${item['cover']}@400w.jpg`, String(item['uname']), parseInt(String(item['online'])) || 0));
    return new LiveCategoryResult(list.length > 0, items);
  }

  async getRoomDetail(roomId: string): Promise<LiveRoomDetail> {
    const roomInfo = await this.getRoomInfo(roomId);
    const realRoomId = String(roomInfo['room_info']['room_id']);
    const danmuBaseUrl = 'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo';
    const danmuResult = await HttpClient.instance.getJson(danmuBaseUrl, { queryParameters: await this.getWbiSign(`${danmuBaseUrl}?id=${realRoomId}`), header: await this.getHeader() });
    const hosts: string[] = (danmuResult['data']['host_list'] ?? []).map((e: any) => String(e['host']));
    const showTime = roomInfo['room_info']?.['live_start_time']?.toString();
    return new LiveRoomDetail(
      realRoomId, String(roomInfo['room_info']['title']), String(roomInfo['room_info']['cover']),
      String(roomInfo['anchor_info']['base_info']['uname']), `${roomInfo['anchor_info']['base_info']['face']}@100w.jpg`,
      asNumber(roomInfo['room_info']['online']), (asNumber(roomInfo['room_info']['live_status']) ?? 0) === 1,
      `https://live.bilibili.com/${roomId}`,
      undefined,
      new BiliBiliDanmakuArgs(parseInt(realRoomId) || 0, String(danmuResult['data']['token']), hosts[0] ?? 'broadcastlv.chat.bilibili.com', this.buvid3, this.userId, this.cookie),
      String(roomInfo['room_info']['description']), '', false, showTime,
    );
  }

  private async getRoomInfo(roomId: string): Promise<any> {
    const result = await HttpClient.instance.getJson('https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom', { queryParameters: await this.getWbiSign(`https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomId}`), header: await this.getHeader() });
    return result['data'];
  }

  async searchRooms(keyword: string, page = 1): Promise<LiveSearchRoomResult> {
    const result = await HttpClient.instance.getJson('https://api.bilibili.com/x/web-interface/search/type?context=&search_type=live&cover_type=user_cover', { queryParameters: { order: '', keyword, category_id: '', __refresh__: '', _extra: '', highlight: 0, single_column: 0, page }, header: await this.getHeader() });
    const items: LiveRoomItem[] = (result['data']['result']['live_room'] ?? []).map((item: any) => new LiveRoomItem(String(item['roomid']), String(item['title']).replace(/<.*?em.*?>/g, ''), `https:${item['cover']}@400w.jpg`, String(item['uname']), parseInt(String(item['online'])) || 0));
    return new LiveSearchRoomResult(items.length >= 40, items);
  }

  async searchAnchors(keyword: string, page = 1): Promise<LiveSearchAnchorResult> {
    const result = await HttpClient.instance.getJson('https://api.bilibili.com/x/web-interface/search/type?context=&search_type=live_user&cover_type=user_cover', { queryParameters: { order: '', keyword, category_id: '', __refresh__: '', _extra: '', highlight: 0, single_column: 0, page }, header: await this.getHeader() });
    const items: LiveAnchorItem[] = (result['data']['result'] ?? []).map((item: any) => new LiveAnchorItem(String(item['roomid']), String(item['uname']).replace(/<.*?em.*?>/g, ''), `https:${item['uface']}@400w.jpg`, item['is_live']));
    return new LiveSearchAnchorResult(items.length >= 40, items);
  }

  async getLiveStatus(roomId: string): Promise<boolean> {
    const result = await HttpClient.instance.getJson('https://api.live.bilibili.com/room/v1/Room/get_info', { queryParameters: { room_id: roomId }, header: await this.getHeader() });
    return (asNumber(result['data']['live_status']) ?? 0) === 1;
  }

  async getSuperChatMessage(roomId: string): Promise<LiveSuperChatMessage[]> {
    const result = await HttpClient.instance.getJson('https://api.live.bilibili.com/av/v1/SuperChat/getMessageList', { queryParameters: { room_id: roomId }, header: await this.getHeader() });
    const ls: LiveSuperChatMessage[] = [];
    for (const item of result['data']?.['list'] ?? []) {
      ls.push(new LiveSuperChatMessage(String(item['user_info']['uname']), `${item['user_info']['face']}@200w.jpg`, String(item['message']), item['price'], new Date(item['start_time'] * 1000), new Date(item['end_time'] * 1000), String(item['background_color']), String(item['background_bottom_color'])));
    }
    return ls;
  }

  // ============ WBI 签名 ============

  private async getBuvid(): Promise<Record<string, string>> {
    try {
      if (this.cookie.includes('buvid3')) {
        return { b_3: this.cookie.match(/buvid3=(.*?);/)?.[1] ?? '', b_4: this.cookie.match(/buvid4=(.*?);/)?.[1] ?? '' };
      }
      const result = await HttpClient.instance.getJson('https://api.bilibili.com/x/frontend/finger/spi', { header: { 'user-agent': BiliBiliSite.UA, referer: BiliBiliSite.REFERER, cookie: this.cookie } });
      return result['data'];
    } catch {
      return { b_3: '', b_4: '' };
    }
  }

  private async getWbiKeys(): Promise<[string, string]> {
    if (BiliBiliSite.kImgKey && BiliBiliSite.kSubKey) return [BiliBiliSite.kImgKey, BiliBiliSite.kSubKey];
    const resp = await HttpClient.instance.getJson('https://api.bilibili.com/x/web-interface/nav', { header: await this.getHeader() });
    const imgUrl = String(resp['data']['wbi_img']['img_url']);
    const subUrl = String(resp['data']['wbi_img']['sub_url']);
    BiliBiliSite.kImgKey = imgUrl.substring(imgUrl.lastIndexOf('/') + 1).split('.')[0];
    BiliBiliSite.kSubKey = subUrl.substring(subUrl.lastIndexOf('/') + 1).split('.')[0];
    return [BiliBiliSite.kImgKey, BiliBiliSite.kSubKey];
  }

  private getMixinKey(origin: string): string {
    return BiliBiliSite.mixinKeyEncTab.reduce((s, i) => s + origin[i], '').substring(0, 32);
  }

  private async getWbiSign(url: string): Promise<Record<string, string>> {
    const [imgKey, subKey] = await this.getWbiKeys();
    const mixinKey = this.getMixinKey(imgKey + subKey);
    const wts = Math.floor(Date.now() / 1000).toString();

    const urlObj = new URL(url);
    const queryParams: Record<string, string> = {};
    urlObj.searchParams.forEach((v, k) => { queryParams[k] = v; });
    queryParams['wts'] = wts;

    // 按 key 排序，过滤特殊字符
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(queryParams).sort()) {
      sorted[key] = queryParams[key].split('').filter((c) => !"!'()*".includes(c)).join('');
    }

    const query = Object.entries(sorted).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const wRid = createHash('md5').update(`${query}${mixinKey}`).digest('hex');
    sorted['w_rid'] = wRid;
    return sorted;
  }

  private async getAccessId(): Promise<string> {
    if (this.accessId) return this.accessId;
    try {
      const resp = await HttpClient.instance.getText('https://live.bilibili.com/lol', { header: await this.getHeader() });
      this.accessId = resp.match(/"access_id":"(.*?)"/)?.[1]?.replace(/\\/g, '') ?? '';
    } catch {
      // ignore
    }
    return this.accessId;
  }
}
