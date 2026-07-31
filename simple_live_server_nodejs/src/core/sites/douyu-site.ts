/**
 * 斗鱼直播平台适配
 *
 * 对应 Dart 版 simple_live_core/lib/src/douyu_site.dart
 */

import { randomBytes } from 'node:crypto';
import { LiveSite } from '../interface/live-site.js';
import { LiveDanmaku } from '../interface/live-danmaku.js';
import { LiveCategory, LiveSubCategory } from '../model/live-category.js';
import { LiveCategoryResult } from '../model/live-category-result.js';
import { LiveSearchRoomResult, LiveSearchAnchorResult } from '../model/live-search-result.js';
import { LiveRoomDetail } from '../model/live-room-detail.js';
import { LivePlayQuality, DouyuPlayData } from '../model/live-play-quality.js';
import { LivePlayUrl } from '../model/live-play-url.js';
import { LiveRoomItem } from '../model/live-room-item.js';
import { LiveAnchorItem } from '../model/live-anchor-item.js';
import { LiveSuperChatMessage } from '../model/live-message.js';
import { HttpClient } from '../common/http-client.js';
import { DouyuSign } from '../scripts/douyu-sign.js';
import { DouyuDanmaku } from '../danmaku/douyu-danmaku.js';
import { decode as htmlUnescape } from 'html-entities';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.43';

export class DouyuSite extends LiveSite {
  id = 'douyu';
  name = '斗鱼直播';

  getDanmaku(): LiveDanmaku {
    return new DouyuDanmaku();
  }

  async getCategores(): Promise<LiveCategory[]> {
    const categories: LiveCategory[] = [];
    const result = await HttpClient.instance.getJson('https://m.douyu.com/api/cate/list');
    const subCateList = result['data']['cate2Info'] as any[];
    for (const item of result['data']['cate1Info']) {
      const cate1Id = item['cate1Id'];
      const subs: LiveSubCategory[] = subCateList.filter((x) => x['cate1Id'] === cate1Id).map((el) => new LiveSubCategory(String(el['cate2Id']), String(el['cate2Name']), String(cate1Id), el['icon']));
      categories.push(new LiveCategory(String(cate1Id), String(item['cate1Name']), subs));
    }
    categories.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    return categories;
  }

  async getCategoryRooms(category: LiveSubCategory, page = 1): Promise<LiveCategoryResult> {
    const result = await HttpClient.instance.getJson(`https://www.douyu.com/gapi/rkc/directory/mixList/2_${category.id}/${page}`);
    const items: LiveRoomItem[] = (result['data']['rl'] ?? []).filter((item: any) => item['type'] === 1).map((item: any) => new LiveRoomItem(String(item['rid']), String(item['rn']), String(item['rs16']), String(item['nn']), item['ol']));
    const hasMore = page < result['data']['pgcnt'];
    return new LiveCategoryResult(hasMore, items);
  }

  async getPlayQualites(detail: LiveRoomDetail): Promise<LivePlayQuality[]> {
    let data = String(detail.data);
    data += '&cdn=&rate=-1&ver=Douyu_223061205&iar=1&ive=1&hevc=0&fa=0';
    const result = await HttpClient.instance.postJson(`https://www.douyu.com/lapi/live/getH5Play/${detail.roomId}`, { data, formUrlEncoded: true });

    const cdns: string[] = (result['data']['cdnsWithName'] ?? []).map((item: any) => String(item['cdn']));
    cdns.sort((a, b) => {
      if (a.startsWith('scdn') && !b.startsWith('scdn')) return 1;
      if (!a.startsWith('scdn') && b.startsWith('scdn')) return -1;
      return 0;
    });

    return (result['data']['multirates'] ?? []).map((item: any) => new LivePlayQuality(String(item['name']), new DouyuPlayData(item['rate'], cdns)));
  }

  async getPlayUrls(detail: LiveRoomDetail, quality: LivePlayQuality): Promise<LivePlayUrl> {
    const args = String(detail.data);
    const playData = quality.data as DouyuPlayData;
    const urls: string[] = [];
    for (const cdn of playData.cdns) {
      const url = await this.getPlayUrl(detail.roomId, args, playData.rate, cdn);
      if (url) urls.push(url);
    }
    return new LivePlayUrl(urls);
  }

  private async getPlayUrl(roomId: string, args: string, rate: number, cdn: string): Promise<string> {
    const data = `${args}&cdn=${cdn}&rate=${rate}`;
    const result = await HttpClient.instance.postJson(`https://www.douyu.com/lapi/live/getH5Play/${roomId}`, { data, header: { referer: `https://www.douyu.com/${roomId}`, 'user-agent': UA }, formUrlEncoded: true });
    return `${result['data']['rtmp_url']}/${htmlUnescape(String(result['data']['rtmp_live']))}`;
  }

  async getRecommendRooms(page = 1): Promise<LiveCategoryResult> {
    const result = await HttpClient.instance.getJson(`https://www.douyu.com/japi/weblist/apinc/allpage/6/${page}`);
    const items: LiveRoomItem[] = (result['data']['rl'] ?? []).filter((item: any) => item['type'] === 1).map((item: any) => new LiveRoomItem(String(item['rid']), String(item['rn']), String(item['rs16']), String(item['nn']), item['ol']));
    const hasMore = page < result['data']['pgcnt'];
    return new LiveCategoryResult(hasMore, items);
  }

  async getRoomDetail(roomId: string): Promise<LiveRoomDetail> {
    const roomInfo = await this.getRoomInfo(roomId);
    const h5RoomInfo = await HttpClient.instance.getJson(`https://www.douyu.com/swf_api/h5room/${roomId}`, { header: { referer: `https://www.douyu.com/${roomId}`, 'user-agent': UA } });
    const showTime = h5RoomInfo['data']?.['show_time']?.toString();

    const jsEncResult = await HttpClient.instance.getText(`https://www.douyu.com/swf_api/homeH5Enc?rids=${roomId}`, { header: { referer: `https://www.douyu.com/${roomId}`, 'user-agent': UA } });
    const crptext = JSON.parse(jsEncResult)['data'][`room${roomId}`].toString();

    const sign = await DouyuSign.getSign(crptext, String(roomInfo['room_id']));
    return new LiveRoomDetail(
      String(roomInfo['room_id']), String(roomInfo['room_name']), String(roomInfo['room_pic']),
      String(roomInfo['owner_name']), String(roomInfo['owner_avatar']),
      parseInt(String(roomInfo['room_biz_all']['hot'])) || 0,
      roomInfo['show_status'] === 1 && roomInfo['videoLoop'] !== 1,
      `https://www.douyu.com/${roomId}`,
      sign, undefined, String(roomInfo['show_details']), '',
      roomInfo['videoLoop'] === 1, showTime,
    );
  }

  private async getRoomInfo(roomId: string): Promise<any> {
    const result = await HttpClient.instance.getJson(`https://www.douyu.com/betard/${roomId}`, { header: { referer: `https://www.douyu.com/${roomId}`, 'user-agent': UA } });
    return typeof result === 'string' ? JSON.parse(result)['room'] : result['room'];
  }

  async searchRooms(keyword: string, page = 1): Promise<LiveSearchRoomResult> {
    const did = this.generateRandomString(32);
    const result = await HttpClient.instance.getJson('https://www.douyu.com/japi/search/api/searchShow', { queryParameters: { kw: keyword, page, pageSize: 20 }, header: { 'User-Agent': UA, referer: 'https://www.douyu.com/search/', Cookie: `dy_did=${did};acf_did=${did}` } });
    if (result['error'] !== 0) throw new Error(result['msg']);
    const items: LiveRoomItem[] = (result['data']['relateShow'] ?? []).map((item: any) => new LiveRoomItem(String(item['rid']), String(item['roomName']), String(item['roomSrc']), String(item['nickName']), this.parseHotNum(String(item['hot']))));
    return new LiveSearchRoomResult(result['data']['relateShow'].length > 0, items);
  }

  async searchAnchors(keyword: string, page = 1): Promise<LiveSearchAnchorResult> {
    const did = this.generateRandomString(32);
    const result = await HttpClient.instance.getJson('https://www.douyu.com/japi/search/api/searchUser', { queryParameters: { kw: keyword, page, pageSize: 20, filterType: 1 }, header: { 'User-Agent': UA, referer: 'https://www.douyu.com/search/', Cookie: `dy_did=${did};acf_did=${did}` } });
    const items: LiveAnchorItem[] = (result['data']['relateUser'] ?? []).map((item: any) => {
      const liveStatus = (parseInt(String(item['anchorInfo']['isLive'])) || 0) === 1;
      const roomType = parseInt(String(item['anchorInfo']['roomType'])) || 0;
      return new LiveAnchorItem(String(item['anchorInfo']['rid']), String(item['anchorInfo']['nickName']), String(item['anchorInfo']['avatar']), liveStatus && roomType === 0);
    });
    return new LiveSearchAnchorResult(result['data']['relateUser'].length > 0, items);
  }

  async getLiveStatus(roomId: string): Promise<boolean> {
    const roomInfo = await this.getRoomInfo(roomId);
    return roomInfo['show_status'] === 1 && roomInfo['videoLoop'] !== 1;
  }

  async getSuperChatMessage(_roomId: string): Promise<LiveSuperChatMessage[]> {
    return [];
  }

  private generateRandomString(length: number): string {
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) result += (bytes[i] % 16).toString(16);
    return result;
  }

  private parseHotNum(hn: string): number {
    try {
      let num = parseFloat(hn.replace('万', ''));
      if (hn.includes('万')) num *= 10000;
      return Math.round(num);
    } catch {
      return -999;
    }
  }
}
