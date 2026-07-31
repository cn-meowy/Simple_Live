import 'package:simple_live_app/app/controller/base_controller.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_core/simple_live_core.dart';

class CategoryDetailController extends BasePageController<LiveRoomItem> {
  final Site site;
  final LiveSubCategory subCategory;
  CategoryDetailController({
    required this.site,
    required this.subCategory,
  });

  @override
  Future<List<LiveRoomItem>> getData(int page, int pageSize) async {
    var result = await LiveApiFactory.instance.getCategoryRooms(site.id, subCategory, page: page);
    return result.items;
  }
}
