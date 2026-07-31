/**
 * 抖音直播平台适配
 *
 * 对应 Dart 版 simple_live_core/lib/src/douyin_site.dart
 */

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
import { asT, asNumber, asString } from '../common/convert-helper.js';
import { DouyinSign } from '../scripts/douyin-sign.js';
import { DouyinDanmaku } from '../danmaku/douyin-danmaku.js';
import { randomInt, randomBytes } from 'node:crypto';

const kDefaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.97 Safari/537.36 Core/1.116.567.400 QQBrowser/19.7.6764.400';
const kDefaultReferer = 'https://live.douyin.com';
const kDefaultAuthority = 'live.douyin.com';
const kDefaultCookie = 'ttwid=1%7CB1qls3GdnZhUov9o2NxOMxxYS2ff6OSvEWbv0ytbES4%7C1680522049%7C280d802d6d478e3e78d0c807f7c487e7ffec0ae4e5fdd6a0fe74c3c6af149511';

/** 抖音弹幕连接参数 */
export class DouyinDanmakuArgs {
  constructor(
    public readonly webRid: string,
    public readonly roomId: string,
    public readonly userId: string,
    public readonly cookie: string,
  ) {}
  toJSON(): Record<string, unknown> {
    return { webRid: this.webRid, roomId: this.roomId, userId: this.userId, cookie: this.cookie };
  }
}

export class DouyinSite extends LiveSite {
  id = 'douyin';
  name = '抖音直播';

  getDanmaku(): LiveDanmaku {
    return new DouyinDanmaku();
  }

  /** 用户设置的 cookie */
  cookie = '';

  private readonly headers: Record<string, string> = {
    Authority: kDefaultAuthority,
    Referer: kDefaultReferer,
    'User-Agent': kDefaultUserAgent,
  };

  private logDebug(msg: string): void {
    CoreLog.d(`[Douyin] ${msg}`);
  }

  async getRequestHeaders(): Promise<Record<string, string>> {
    try {
      if (this.cookie) {
        this.headers['cookie'] = this.cookie;
        return this.headers;
      }
      this.headers['cookie'] = kDefaultCookie;
      return this.headers;
    } catch (e) {
      CoreLog.error(e);
      if (!this.headers['cookie']) this.headers['cookie'] = kDefaultCookie;
      return this.headers;
    }
  }

  async getCategores(): Promise<LiveCategory[]> {
    const categories: LiveCategory[] = [];
    const result = await HttpClient.instance.getText('https://live.douyin.com/', { header: await this.getRequestHeaders() });

    const renderData = result.match(/\{\\"pathname\\":\\"\/\\",\\"categoryData.*?\]\n/)?.[0] ?? '';
    const json = JSON.parse(renderData.trim().replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(']\n', ''));

    for (const item of json['categoryData']) {
      const subs: LiveSubCategory[] = [];
      const id = `${item['partition']['id_str']},${item['partition']['type']}`;
      for (const subItem of item['sub_partition']) {
        subs.push(new LiveSubCategory(
          `${subItem['partition']['id_str']},${subItem['partition']['type']}`,
          asT<string>(subItem['partition']['title']) ?? '',
          id, '',
        ));
      }
      const category = new LiveCategory(id, asT<string>(item['partition']['title']) ?? '', subs);
      subs.unshift(new LiveSubCategory(category.id, category.name, category.id, ''));
      categories.push(category);
    }
    return categories;
  }

  async getCategoryRooms(category: LiveSubCategory, page = 1): Promise<LiveCategoryResult> {
    const ids = category.id.split(',');
    const [partitionId, partitionType] = ids;
    const serverUrl = 'https://live.douyin.com/webcast/web/partition/detail/room/v2/';
    const url = new URL(serverUrl);
    url.search = new URLSearchParams({
      aid: '6383', app_name: 'douyin_web', live_id: '1', device_platform: 'web',
      language: 'zh-CN', enter_from: 'link_share', cookie_enabled: 'true',
      screen_width: '1980', screen_height: '1080', browser_language: 'zh-CN',
      browser_platform: 'Win32', browser_name: 'Edge', browser_version: '125.0.0.0',
      browser_online: 'true', count: '15', offset: ((page - 1) * 15).toString(),
      partition: partitionId, partition_type: partitionType, req_from: '2',
    }).toString();
    const requestUrl = await DouyinSign.getAbogusUrl(url.toString(), kDefaultUserAgent);
    const result = await HttpClient.instance.getJson(requestUrl, { header: await this.getRequestHeaders() });

    const data = result['data']['data'] as any[];
    const hasMore = data.length >= 15;
    const items: LiveRoomItem[] = [];
    for (const item of data) {
      items.push(new LiveRoomItem(
        item['web_rid'],
        String(item['room']['title']),
        String(item['room']['cover']['url_list'][0]),
        String(item['room']['owner']['nickname']),
        parseInt(item['room']['room_view_stats']['display_value']?.toString() ?? '0', 10) || 0,
      ));
    }
    return new LiveCategoryResult(hasMore, items);
  }

  async getRecommendRooms(page = 1): Promise<LiveCategoryResult> {
    const serverUrl = 'https://live.douyin.com/webcast/web/partition/detail/room/v2/';
    const url = new URL(serverUrl);
    url.search = new URLSearchParams({
      aid: '6383', app_name: 'douyin_web', live_id: '1', device_platform: 'web',
      language: 'zh-CN', enter_from: 'link_share', cookie_enabled: 'true',
      screen_width: '1980', screen_height: '1080', browser_language: 'zh-CN',
      browser_platform: 'Win32', browser_name: 'Edge', browser_version: '125.0.0.0',
      browser_online: 'true', count: '15', offset: ((page - 1) * 15).toString(),
      partition: '720', partition_type: '1', req_from: '2',
    }).toString();
    const requestUrl = await DouyinSign.getAbogusUrl(url.toString(), kDefaultUserAgent);
    const result = await HttpClient.instance.getJson(requestUrl, { header: await this.getRequestHeaders() });

    const data = result['data']['data'] as any[];
    const hasMore = data.length >= 15;
    const items: LiveRoomItem[] = [];
    for (const item of data) {
      items.push(new LiveRoomItem(
        item['web_rid'],
        String(item['room']['title']),
        String(item['room']['cover']['url_list'][0]),
        String(item['room']['owner']['nickname']),
        parseInt(item['room']['room_view_stats']['display_value']?.toString() ?? '0', 10) || 0,
      ));
    }
    return new LiveCategoryResult(hasMore, items);
  }

  async getRoomDetail(roomId: string): Promise<LiveRoomDetail> {
    // roomId <= 16 视为 webRid
    if (roomId.length <= 16) return this.getRoomDetailByWebRid(roomId);
    return this.getRoomDetailByRoomId(roomId);
  }

  async getRoomDetailByRoomId(roomId: string): Promise<LiveRoomDetail> {
    const roomData = await this._getRoomDataByRoomId(roomId);
    const webRid = String(roomData['data']['room']['owner']['web_rid']);
    const userUniqueId = this.generateRandomNumber(12).toString();
    const room = roomData['data']['room'];
    const owner = room['owner'];
    const status = asNumber(room['status']) ?? 0;

    // status == 4 表示 roomId 已失效（用户重新开播），改走 webRid
    if (status === 4) return this.getRoomDetailByWebRid(webRid);

    const roomStatus = status === 2;
    const headers = await this.getRequestHeaders();
    return new LiveRoomDetail(
      webRid, String(room['title']),
      roomStatus ? String(room['cover']['url_list'][0]) : '',
      String(owner['nickname']), String(owner['avatar_thumb']['url_list'][0]),
      roomStatus ? asNumber(room['room_view_stats']['display_value']) ?? 0 : 0,
      roomStatus, `https://live.douyin.com/${webRid}`,
      room['stream_url'], new DouyinDanmakuArgs(webRid, roomId, userUniqueId, headers['cookie']),
      String(owner['signature']), '',
    );
  }

  async getRoomDetailByWebRid(webRid: string): Promise<LiveRoomDetail> {
    try {
      return await this._getRoomDetailByWebRidApi(webRid);
    } catch (e) {
      CoreLog.error(e);
    }
    return this._getRoomDetailByWebRidHtml(webRid);
  }

  private async _getRoomDetailByWebRidApi(webRid: string): Promise<LiveRoomDetail> {
    const data = await this._getRoomDataByApi(webRid);
    const roomData = data['data'][0];
    const userData = data['user'];
    const roomId = String(roomData['id_str']);
    const userUniqueId = this.generateRandomNumber(12).toString();
    const owner = roomData['owner'];
    const roomStatus = (asNumber(roomData['status']) ?? 0) === 2;
    const headers = await this.getRequestHeaders();
    return new LiveRoomDetail(
      webRid, String(roomData['title']),
      roomStatus ? String(roomData['cover']['url_list'][0]) : '',
      roomStatus ? String(owner['nickname']) : String(userData['nickname']),
      roomStatus ? String(owner['avatar_thumb']['url_list'][0]) : String(userData['avatar_thumb']['url_list'][0]),
      roomStatus ? asNumber(roomData['room_view_stats']['display_value']) ?? 0 : 0,
      roomStatus, `https://live.douyin.com/${webRid}`,
      roomStatus ? roomData['stream_url'] : {}, new DouyinDanmakuArgs(webRid, roomId, userUniqueId, headers['cookie']),
      owner?.['signature']?.toString() ?? '', '',
    );
  }

  private async _getRoomDetailByWebRidHtml(webRid: string): Promise<LiveRoomDetail> {
    const roomData = await this._getRoomDataByHtml(webRid);
    const roomId = String(roomData['roomStore']['roomInfo']['room']['id_str']);
    const userUniqueId = String(roomData['userStore']['odin']['user_unique_id']);
    const room = roomData['roomStore']['roomInfo']['room'];
    const owner = room['owner'];
    const anchor = roomData['roomStore']['roomInfo']['anchor'];
    const roomStatus = (asNumber(room['status']) ?? 0) === 2;
    const headers = await this.getRequestHeaders();
    return new LiveRoomDetail(
      webRid, String(room['title']),
      roomStatus ? String(room['cover']['url_list'][0]) : '',
      roomStatus ? String(owner['nickname']) : String(anchor['nickname']),
      roomStatus ? String(owner['avatar_thumb']['url_list'][0]) : String(anchor['avatar_thumb']['url_list'][0]),
      roomStatus ? asNumber(room['room_view_stats']['display_value']) ?? 0 : 0,
      roomStatus, `https://live.douyin.com/${webRid}`,
      roomStatus ? room['stream_url'] : {}, new DouyinDanmakuArgs(webRid, roomId, userUniqueId, headers['cookie']),
      owner?.['signature']?.toString() ?? '', '',
    );
  }

  /** 通过 webRid 获取直播间 Web 信息（解析 HTML 中嵌入的 render data） */
  private async _getRoomDataByHtml(webRid: string): Promise<any> {
    const dyCookie = await this._getWebCookie(webRid);
    const result = await HttpClient.instance.getText(`https://live.douyin.com/${webRid}`, { header: {
      Authority: kDefaultAuthority,
      Referer: kDefaultReferer,
      Cookie: dyCookie,
      'User-Agent': kDefaultUserAgent,
    } });
    const renderData = result.match(/\{\\"state\\":\{\\"appStore.*?\]\n/)?.[0] ?? '';
    const str = renderData.trim().replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(']\n', '');
    return JSON.parse(str)['state'];
  }

  /** 通过 webRid 调用 enter API 获取直播间信息 */
  private async _getRoomDataByApi(webRid: string): Promise<any> {
    const serverUrl = 'https://live.douyin.com/webcast/room/web/enter/';
    const requestHeader = await this.getRequestHeaders();
    requestHeader['Referer'] = `https://live.douyin.com/${webRid}`;
    const url = new URL(serverUrl);
    url.search = new URLSearchParams({
      aid: '6383', app_name: 'douyin_web', live_id: '1', device_platform: 'web',
      language: 'zh-CN', browser_language: 'zh-CN', browser_platform: 'Win32',
      browser_name: 'Chrome', browser_version: '125.0.0.0',
      web_rid: webRid, msToken: '',
    }).toString();
    const requestUrl = await DouyinSign.getAbogusUrl(url.toString(), kDefaultUserAgent);
    const result = await HttpClient.instance.getJson(requestUrl, { header: requestHeader });
    if (typeof result !== 'object' || result === null) throw new Error('抖音接口返回格式异常');
    return result['data'];
  }

  /** 通过 roomId 获取直播间信息 */
  private async _getRoomDataByRoomId(roomId: string): Promise<any> {
    return HttpClient.instance.getJson('https://webcast.amemv.com/webcast/room/reflow/info/', {
      queryParameters: {
        type_id: 0, live_id: 1, room_id: roomId, sec_user_id: '',
        version_code: '99.99.99', app_id: 6383,
      },
      header: await this.getRequestHeaders(),
    });
  }

  /** 进入直播间前通过 HEAD 获取 cookie（ttwid/__ac_nonce/msToken） */
  private async _getWebCookie(webRid: string): Promise<string> {
    const headResp = await HttpClient.instance.head(`https://live.douyin.com/${webRid}`, { header: this.headers });
    let dyCookie = '';
    const setCookies = headResp.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
    for (const element of list) {
      const cookie = String(element).split(';')[0];
      if (cookie.includes('ttwid')) dyCookie += `${cookie};`;
      if (cookie.includes('__ac_nonce')) dyCookie += `${cookie};`;
      if (cookie.includes('msToken')) dyCookie += `${cookie};`;
    }
    return dyCookie;
  }

  async getPlayQualites(detail: LiveRoomDetail): Promise<LivePlayQuality[]> {
    const qualities: LivePlayQuality[] = [];
    try {
      const liveCoreData = (detail.data as any)['live_core_sdk_data'];
        if (!liveCoreData) return qualities;
        const pullData = liveCoreData['pull_data'];
        if (!pullData) return qualities;
        const options = pullData['options'];
        const qulityList = options?.['qualities'];
        const streamData = pullData['stream_data']?.toString() ?? '';
  
        if (!streamData.startsWith('{')) {
          const flvList = Object.values((detail.data as any)['flv_pull_url'] ?? {}) as string[];
          const hlsList = Object.values((detail.data as any)['hls_pull_url_map'] ?? {}) as string[];
          for (const quality of qulityList) {
            const level = quality['level'] as number;
            const urls: string[] = [];
            const flvIndex = flvList.length - level;
            if (flvIndex >= 0 && flvIndex < flvList.length) urls.push(flvList[flvIndex]);
            const hlsIndex = hlsList.length - level;
            if (hlsIndex >= 0 && hlsIndex < hlsList.length) urls.push(hlsList[hlsIndex]);
            if (urls.length) qualities.push(new LivePlayQuality(quality['name'], urls, level));
          }
        } else {
          const qualityData = JSON.parse(streamData)['data'] as Record<string, any>;
          for (const quality of qulityList) {
            const urls: string[] = [];
            const flvUrl = qualityData[quality['sdk_key']]?.['main']?.['flv']?.toString();
            if (flvUrl) urls.push(flvUrl);
            const hlsUrl = qualityData[quality['sdk_key']]?.['main']?.['hls']?.toString();
            if (hlsUrl) urls.push(hlsUrl);
            if (urls.length) qualities.push(new LivePlayQuality(quality['name'], urls, quality['level']));
          }
        }
    } catch (e) {
      CoreLog.error(e);
    }
    qualities.sort((a, b) => b.sort - a.sort);
    this.logDebug(`获取到的画质列表: ${qualities.map(q => q.quality).join(', ')}`);
    return qualities;
  }

  async getPlayUrls(detail: LiveRoomDetail, quality: LivePlayQuality): Promise<LivePlayUrl> {
    return new LivePlayUrl([...(quality.data as string[])]);
  }

  async searchRooms(keyword: string, page = 1): Promise<LiveSearchRoomResult> {
    const serverUrl = 'https://www.douyin.com/aweme/v1/web/live/search/';
    const url = new URL(serverUrl);
    url.search = new URLSearchParams({
      device_platform: 'webapp', aid: '6383', channel: 'channel_pc_web',
      search_channel: 'aweme_live', keyword, search_source: 'switch_tab',
      query_correct_type: '1', is_filter_search: '0', from_group_id: '',
      offset: ((page - 1) * 10).toString(), count: '10', pc_client_type: '1',
      version_code: '170400', version_name: '17.4.0', cookie_enabled: 'true',
      screen_width: '1980', screen_height: '1080', browser_language: 'zh-CN',
      browser_platform: 'Win32', browser_name: 'Edge', browser_version: '125.0.0.0',
      browser_online: 'true', engine_name: 'Blink', engine_version: '125.0.0.0',
      os_name: 'Windows', os_version: '10', cpu_core_num: '12', device_memory: '8',
      platform: 'PC', downlink: '10', effective_type: '4g', round_trip_time: '100',
      webid: '7382872326016435738',
    }).toString();
    const requestUrl = url.toString();
    const headResp = await HttpClient.instance.head('https://live.douyin.com', { header: this.headers });
    let dyCookie = '';
    const setCookies = headResp.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
    for (const element of list) {
      const cookie = String(element).split(';')[0];
      if (cookie.includes('ttwid')) dyCookie += `${cookie};`;
      if (cookie.includes('__ac_nonce')) dyCookie += `${cookie};`;
    }
    const result = await HttpClient.instance.getJson(requestUrl, { header: {
      Authority: 'www.douyin.com',
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      cookie: dyCookie,
      priority: 'u=1, i',
      referer: `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=live`,
      'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': kDefaultUserAgent,
    } });
    if (result === '' || result === 'blocked') throw new Error('抖音直播搜索被限制，请稍后再试');
    const items: LiveRoomItem[] = [];
    for (const item of (result['data'] ?? [])) {
      const itemData = JSON.parse(item['lives']['rawdata'].toString());
      items.push(new LiveRoomItem(
        String(itemData['owner']['web_rid']),
        String(itemData['title']),
        String(itemData['cover']['url_list'][0]),
        String(itemData['owner']['nickname']),
        parseInt(itemData['stats']['total_user']?.toString() ?? '0', 10) || 0,
      ));
    }
    return new LiveSearchRoomResult(items.length >= 10, items);
  }

  async searchAnchors(keyword: string, page = 1): Promise<LiveSearchAnchorResult> {
    throw new Error('抖音暂不支持搜索主播，请直接搜索直播间');
  }

  async getLiveStatus(roomId: string): Promise<boolean> {
    const result = await this.getRoomDetail(roomId);
    return result.status;
  }

  async getSuperChatMessage(roomId: string): Promise<LiveSuperChatMessage[]> {
    return [];
  }

  /** 生成指定长度的 16 进制随机字符串 */
  private generateRandomString(length: number): string {
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += (bytes[i] & 0xf).toString(16);
    return out;
  }

  /** 生成指定长度的随机数字 */
  private generateRandomNumber(length: number): number {
    let s = '';
    for (let i = 0; i < length; i++) s += randomInt(0, 10).toString();
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? randomInt(0, 1000000000) : n;
  }
}
