import { normalizeLangKey } from './policy';

const PYTHON: Record<number, string> = {
    0: '# Write your code here\n',
    1: `# 先把题目要求的数据读进来
# 再完成中间的处理
# 最后按题目要求输出

data = input()

# TODO：在这里处理

print(____)
`,
    3: `# 陪我一步一步做：基础读写先写好，中间最关键的判断留给你
data = input()

# 先准备一个变量，用来记住当前结果
answer = ______

# 这里需要你写出最关键的一步（比较 / 循环 / 更新）
if ______:
    ______

# 按题目要求输出
print(answer)
`,
};

const CPP: Record<number, string> = {
    0: `#include <iostream>
using namespace std;
int main() {
    // Write your code here
    return 0;
}
`,
    1: `#include <iostream>
using namespace std;
int main() {
    // 先读入题目给的数据
    // 再完成中间处理
    // 最后输出答案
    return 0;
}
`,
    3: `#include <iostream>
using namespace std;
int main() {
    // 先读入
    int x;
    cin >> x;
    // 准备一个变量记住当前结果
    int answer = ______;
    // 最关键的一步留给你
    if (______) {
        ______;
    }
    cout << answer << endl;
    return 0;
}
`,
};

const JAVA: Record<number, string> = {
    0: `public class Main {
    public static void main(String[] args) {
        // Write your code here
    }
}
`,
    1: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // TODO：读入并处理
        System.out.println(____);
    }
}
`,
    3: `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int x = sc.nextInt();
        int answer = ______;
        if (______) {
            ______;
        }
        System.out.println(answer);
    }
}
`,
};

const BY_LANG: Record<string, Record<number, string>> = {
    python: PYTHON,
    cpp: CPP,
    c: CPP,
    java: JAVA,
};

export function builtinScaffold(language: string, level: number): string {
    const fam = normalizeLangKey(language);
    const pack = BY_LANG[fam] || PYTHON;
    return pack[level] ?? pack[0] ?? '';
}
