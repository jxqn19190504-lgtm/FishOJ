/** 三数最大值示例模板，教师后台可一键填入。核心比较必须留空。 */

export const DEMO_META = {
    objectives: ['condition', 'variable_update'],
    secondarySkills: ['input', 'output'],
    concepts: ['条件判断', '最大值变量', '状态更新'],
    stages: [
        { id: 'read_input', title: '读取三个整数' },
        { id: 'init_max', title: '选择初始最大值' },
        { id: 'compare_b', title: '比较第二个数' },
        { id: 'compare_c', title: '比较第三个数' },
        { id: 'print', title: '输出最大值' },
    ],
    protectedStages: ['init_max', 'compare_b', 'compare_c'],
    commonMistakes: [
        'max_value 初始化为 0',
        '只比较前两个数',
        '比较后没有更新 max_value',
    ],
};

export const DEMO_SCAFFOLDS: Record<string, Record<number, string>> = {
    python: {
        0: '# Write your code here\n',
        1: 'a, b, c = map(int, input().split())\n\n# 找出三个数中的最大值\n\n\nprint(____)\n',
        2: 'a, b, c = map(int, input().split())\n\nmax_value = ______\n\nif ______:\n    ______\n\nif ______:\n    ______\n\nprint(max_value)\n',
        3: 'a, b, c = map(int, input().split())\n\n# 先选择一个数字作为当前最大值\nmax_value = ______\n\n# 比较第二个数\nif ______:\n    ______\n\n# 比较第三个数\nif ______:\n    ______\n\nprint(max_value)\n',
    },
    cpp: {
        0: '#include <iostream>\nusing namespace std;\nint main() {\n    // Write your code here\n    return 0;\n}\n',
        1: '#include <iostream>\nusing namespace std;\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    // 找出三个数中的最大值\n    cout << ____ << endl;\n    return 0;\n}\n',
        2: '#include <iostream>\nusing namespace std;\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    int max_value = ______;\n    if (______) {\n        ______;\n    }\n    if (______) {\n        ______;\n    }\n    cout << max_value << endl;\n    return 0;\n}\n',
        3: '#include <iostream>\nusing namespace std;\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    // 先选择一个数字作为当前最大值\n    int max_value = ______;\n    // 比较第二个数\n    if (______) {\n        ______;\n    }\n    // 比较第三个数\n    if (______) {\n        ______;\n    }\n    cout << max_value << endl;\n    return 0;\n}\n',
    },
};
