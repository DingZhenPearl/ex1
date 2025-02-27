#include <iostream>
#include <vector>
#include <unordered_map>
#include "nlohmann/json.hpp"

using json = nlohmann::json;

// 查找和为 target 的两个数的索引
std::vector<int> twoSum(std::vector<int>& nums, int target) {
    std::unordered_map<int, int> numMap;
    for (int i = 0; i < nums.size(); ++i) {
        int complement = target - nums[i];
        if (numMap.find(complement) != numMap.end()) {
            return {numMap[complement], i};
        }
        numMap[nums[i]] = i;
    }
    return {};
}

int main() {
    std::vector<int> nums;
    int num;
    char c;
    // 持续读取输入直到遇到换行符
    while (std::cin >> num) {
        std::cin.get(c);
        if (c == '\n') {
            break;
        }
        nums.push_back(num);
    }
    int target = num;
    // 调用 twoSum 函数查找结果
    std::vector<int> result = twoSum(nums, target);
    // 将结果转换为 JSON 数组
    json jsonResult = result;
    // 输出 JSON 数组
    std::cout << jsonResult << std::endl;
    return 0;
}