import 'package:simple_live_app/app/controller/base_controller.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_core/simple_live_core.dart';

class HomeListController extends BasePageController<LiveRoomItem> {
  final Site site;
  HomeListController(this.site);

  @override
  Future<List<LiveRoomItem>> getData(int page, int pageSize) async {
    var result = await LiveApiFactory.instance.getRecommendRooms(site.id, page: page);

    return result.items;
  }
}
