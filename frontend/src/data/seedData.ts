import {
  Assessment,
  AuditLog,
  CandidateSession,
  Classroom,
  Department,
  Institution,
  ProctoringEvent,
  Question,
  Submission,
  User,
} from '../types';

export const INITIAL_INSTITUTIONS: Institution[] = [];

export const DEMO_USERS: User[] = [
  {
    id: 'usr-admin',
    name: 'System Admin (CSE)',
    email: 'admin@examcode.cse.in',
    role: 'ADMIN',
    institutionId: '',
    institutionName: '',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

export const INITIAL_QUESTIONS: Question[] = [
  {
    id: 'q-1',
    type: 'CODING',
    title: 'Find Maximum Element',
    problemStatement: 'Given an array of N integers, find the largest element.',
    inputFormat: 'The first line contains an integer N, representing the number of elements.\nThe second line contains N space-separated integers.',
    outputFormat: 'Print the largest element in the array.',
    constraints: '1 ≤ N ≤ 100000\n-10^9 ≤ A[i] ≤ 10^9',
    explanation: 'Find and print the maximum integer among the given N elements.',
    sampleTestCases: [
      {
        input: '5\n10 20 5 30 15',
        output: '30',
        explanation: 'The largest value among the given elements is 30.',
      },
      {
        input: '4\n8 2 9 1',
        output: '9',
        explanation: 'The largest value among 8, 2, 9, 1 is 9.',
      },
    ],
    hiddenTestCases: [
      { input: '1\n42', output: '42' },
      { input: '6\n-10 -5 -20 -1 -15 -30', output: '-1' },
      { input: '3\n100 100 50', output: '100' },
    ],
    difficulty: 'EASY',
    tags: ['Array', 'Algorithms'],
    points: 20,
    testCases: [
      { id: 'tc-1', input: '5\n10 20 5 30 15', expectedOutput: '30', isPublic: true, explanation: 'Sample Case 1' },
      { id: 'tc-2', input: '4\n8 2 9 1', expectedOutput: '9', isPublic: true, explanation: 'Sample Case 2' },
      { id: 'tc-3', input: '1\n42', expectedOutput: '42', isPublic: false },
      { id: 'tc-4', input: '6\n-10 -5 -20 -1 -15 -30', expectedOutput: '-1', isPublic: false },
      { id: 'tc-5', input: '3\n100 100 50', expectedOutput: '100', isPublic: false },
    ],
  },
  {
    id: 'q-2',
    type: 'CODING',
    title: 'Two Sum',
    problemStatement: 'Given an array of N integers and a target sum, find the 0-based indices of two numbers such that they add up to target.',
    inputFormat: 'The first line contains two integers N and Target.\nThe second line contains N space-separated integers.',
    outputFormat: 'Print the two 0-based space-separated indices in ascending order.',
    constraints: '2 ≤ N ≤ 10^5\n-10^9 ≤ A[i], Target ≤ 10^9',
    explanation: 'Locate two numbers whose sum equals Target.',
    sampleTestCases: [
      {
        input: '4 9\n2 7 11 15',
        output: '0 1',
        explanation: '2 + 7 = 9. The indices are 0 and 1.',
      },
    ],
    hiddenTestCases: [
      { input: '3 6\n3 2 4', output: '1 2' },
      { input: '2 6\n3 3', output: '0 1' },
    ],
    difficulty: 'EASY',
    tags: ['Array', 'Hash Table'],
    points: 20,
    testCases: [
      { id: 'tc-201', input: '4 9\n2 7 11 15', expectedOutput: '0 1', isPublic: true },
      { id: 'tc-202', input: '3 6\n3 2 4', expectedOutput: '1 2', isPublic: false },
      { id: 'tc-203', input: '2 6\n3 3', expectedOutput: '0 1', isPublic: false },
    ],
  },
  {
    id: 'q-3',
    type: 'CODING',
    title: 'Reverse String',
    problemStatement: 'Given a string S, print the string reversed.',
    inputFormat: 'The input contains a single string S.',
    outputFormat: 'Print the reversed string.',
    constraints: '1 ≤ |S| ≤ 10^5',
    explanation: 'Reverse the characters in string S.',
    sampleTestCases: [
      {
        input: 'hello',
        output: 'olleh',
        explanation: 'Reversing "hello" produces "olleh".',
      },
    ],
    hiddenTestCases: [
      { input: 'Hannah', output: 'hannaH' },
      { input: 'a', output: 'a' },
    ],
    difficulty: 'EASY',
    tags: ['String', 'Two Pointers'],
    points: 15,
    testCases: [
      { id: 'tc-301', input: 'hello', expectedOutput: 'olleh', isPublic: true },
      { id: 'tc-302', input: 'Hannah', expectedOutput: 'hannaH', isPublic: false },
      { id: 'tc-303', input: 'a', expectedOutput: 'a', isPublic: false },
    ],
  },
  {
    id: 'q-4',
    type: 'CODING',
    title: 'Maximum Subarray Sum',
    problemStatement: 'Given an integer array of N elements, find the contiguous subarray with the largest sum and print that sum.',
    inputFormat: 'The first line contains an integer N.\nThe second line contains N space-separated integers.',
    outputFormat: 'Print a single integer representing the maximum subarray sum.',
    constraints: '1 ≤ N ≤ 100000\n-10^4 ≤ A[i] ≤ 10^4',
    explanation: 'Use Kadane\'s algorithm to find the maximum contiguous subarray sum.',
    sampleTestCases: [
      {
        input: '9\n-2 1 -3 4 -1 2 1 -5 4',
        output: '6',
        explanation: 'The subarray [4, -1, 2, 1] has the maximum sum 6.',
      },
    ],
    hiddenTestCases: [
      { input: '1\n5', output: '5' },
      { input: '5\n5 4 -1 7 8', output: '23' },
    ],
    difficulty: 'MEDIUM',
    tags: ['Dynamic Programming', 'Array', 'Kadane'],
    points: 25,
    testCases: [
      { id: 'tc-401', input: '9\n-2 1 -3 4 -1 2 1 -5 4', expectedOutput: '6', isPublic: true },
      { id: 'tc-402', input: '1\n5', expectedOutput: '5', isPublic: false },
      { id: 'tc-403', input: '5\n5 4 -1 7 8', expectedOutput: '23', isPublic: false },
    ],
  },
  {
    id: 'q-5',
    type: 'CODING',
    title: 'Palindrome Check',
    problemStatement: 'Check if a given string S is a palindrome (reads same forward and backward, case-insensitive alphanumeric). Print "YES" if palindrome, else "NO".',
    inputFormat: 'The input contains a single string S.',
    outputFormat: 'Print "YES" if S is a palindrome, otherwise "NO".',
    constraints: '1 ≤ |S| ≤ 10^5',
    explanation: 'Check symmetry of alphanumeric characters in S.',
    sampleTestCases: [
      {
        input: 'racecar',
        output: 'YES',
        explanation: '"racecar" is a palindrome.',
      },
    ],
    hiddenTestCases: [
      { input: 'hello', output: 'NO' },
      { input: 'MadAm', output: 'YES' },
    ],
    difficulty: 'EASY',
    tags: ['String'],
    points: 20,
    testCases: [
      { id: 'tc-501', input: 'racecar', expectedOutput: 'YES', isPublic: true },
      { id: 'tc-502', input: 'hello', expectedOutput: 'NO', isPublic: false },
      { id: 'tc-503', input: 'MadAm', expectedOutput: 'YES', isPublic: false },
    ],
  },
  {
    id: 'q-6',
    type: 'CODING',
    title: 'Valid Anagram',
    problemStatement: 'Given two strings S1 and S2 on separate lines, determine if S2 is an anagram of S1. Print "YES" if S2 is an anagram of S1, else "NO".',
    inputFormat: 'The first line contains string S1.\nThe second line contains string S2.',
    outputFormat: 'Print "YES" if S2 is an anagram of S1, otherwise "NO".',
    constraints: '1 ≤ |S1|, |S2| ≤ 10^5',
    explanation: 'Check if S2 contains the exact same character frequencies as S1.',
    sampleTestCases: [
      {
        input: 'anagram\nnagaram',
        output: 'YES',
        explanation: '"nagaram" contains the exact same characters as "anagram".',
      },
      {
        input: 'rat\ncar',
        output: 'NO',
        explanation: '"car" is not an anagram of "rat".',
      },
    ],
    hiddenTestCases: [
      { input: 'listen\nsilent', output: 'YES' },
      { input: 'a\nab', output: 'NO' },
      { input: 'aabbcc\nabcabc', output: 'YES' },
    ],
    difficulty: 'EASY',
    tags: ['String', 'Hash Table'],
    points: 20,
    testCases: [
      { id: 'tc-601', input: 'anagram\nnagaram', expectedOutput: 'YES', isPublic: true },
      { id: 'tc-602', input: 'rat\ncar', expectedOutput: 'NO', isPublic: true },
      { id: 'tc-603', input: 'listen\nsilent', expectedOutput: 'YES', isPublic: false },
      { id: 'tc-604', input: 'a\nab', expectedOutput: 'NO', isPublic: false },
      { id: 'tc-605', input: 'aabbcc\nabcabc', expectedOutput: 'YES', isPublic: false },
    ],
  },
  {
    id: 'q-7',
    type: 'CODING',
    title: 'Binary Search in Sorted Array',
    problemStatement: 'Given a sorted array of N distinct integers and a target value K, find the 0-based index of K using binary search. If K is not present, print -1.',
    inputFormat: 'The first line contains two integers N and K.\nThe second line contains N space-separated sorted integers.',
    outputFormat: 'Print the 0-based index of K if found, otherwise print -1.',
    constraints: '1 ≤ N ≤ 10^5\n-10^9 ≤ A[i], K ≤ 10^9',
    explanation: 'Perform binary search in O(log N) time to find the index of K.',
    sampleTestCases: [
      {
        input: '5 3\n1 2 3 4 5',
        output: '2',
        explanation: 'Target 3 is located at index 2.',
      },
    ],
    hiddenTestCases: [
      { input: '4 10\n2 4 6 8', output: '-1' },
      { input: '1 5\n5', output: '0' },
      { input: '6 1\n1 3 5 7 9 11', output: '0' },
    ],
    difficulty: 'EASY',
    tags: ['Array', 'Binary Search'],
    points: 20,
    testCases: [
      { id: 'tc-701', input: '5 3\n1 2 3 4 5', expectedOutput: '2', isPublic: true },
      { id: 'tc-702', input: '4 10\n2 4 6 8', expectedOutput: '-1', isPublic: false },
      { id: 'tc-703', input: '1 5\n5', expectedOutput: '0', isPublic: false },
      { id: 'tc-704', input: '6 1\n1 3 5 7 9 11', expectedOutput: '0', isPublic: false },
    ],
  },
  {
    id: 'q-8',
    type: 'CODING',
    title: 'Longest Common Prefix',
    problemStatement: 'Write a program to find the longest common prefix among N space-separated strings. If there is no common prefix, print "-1".',
    inputFormat: 'The first line contains an integer N.\nThe second line contains N space-separated strings.',
    outputFormat: 'Print the longest common prefix string, or "-1" if no common prefix exists.',
    constraints: '1 ≤ N ≤ 200\n0 ≤ |S[i]| ≤ 200',
    explanation: 'Compare characters index-by-index across all N strings.',
    sampleTestCases: [
      {
        input: '3\nflower flow flight',
        output: 'fl',
        explanation: 'The common prefix among "flower", "flow", and "flight" is "fl".',
      },
    ],
    hiddenTestCases: [
      { input: '3\ndog racecar car', output: '-1' },
      { input: '2\nabc ab', output: 'ab' },
      { input: '1\nsingle', output: 'single' },
    ],
    difficulty: 'EASY',
    tags: ['String', 'Prefix'],
    points: 20,
    testCases: [
      { id: 'tc-801', input: '3\nflower flow flight', expectedOutput: 'fl', isPublic: true },
      { id: 'tc-802', input: '3\ndog racecar car', expectedOutput: '-1', isPublic: false },
      { id: 'tc-803', input: '2\nabc ab', expectedOutput: 'ab', isPublic: false },
      { id: 'tc-804', input: '1\nsingle', expectedOutput: 'single', isPublic: false },
    ],
  },
  {
    id: 'q-9',
    type: 'CODING',
    title: 'Merge Two Sorted Arrays',
    problemStatement: 'Given two sorted integer arrays A of size N and B of size M, merge them into a single sorted array and print space-separated elements.',
    inputFormat: 'The first line contains two integers N and M.\nThe second line contains N space-separated integers for array A.\nThe third line contains M space-separated integers for array B.',
    outputFormat: 'Print the combined sorted array as space-separated integers.',
    constraints: '1 ≤ N, M ≤ 10^5\n-10^9 ≤ A[i], B[j] ≤ 10^9',
    explanation: 'Use two pointers to merge arrays A and B in O(N + M) time.',
    sampleTestCases: [
      {
        input: '3 3\n1 3 5\n2 4 6',
        output: '1 2 3 4 5 6',
        explanation: 'Merging [1, 3, 5] and [2, 4, 6] produces [1, 2, 3, 4, 5, 6].',
      },
    ],
    hiddenTestCases: [
      { input: '2 1\n10 20\n15', output: '10 15 20' },
      { input: '1 1\n5\n5', output: '5 5' },
      { input: '3 2\n-5 0 5\n-2 3', output: '-5 -2 0 3 5' },
    ],
    difficulty: 'MEDIUM',
    tags: ['Array', 'Two Pointers'],
    points: 25,
    testCases: [
      { id: 'tc-901', input: '3 3\n1 3 5\n2 4 6', expectedOutput: '1 2 3 4 5 6', isPublic: true },
      { id: 'tc-902', input: '2 1\n10 20\n15', expectedOutput: '10 15 20', isPublic: false },
      { id: 'tc-903', input: '1 1\n5\n5', expectedOutput: '5 5', isPublic: false },
      { id: 'tc-904', input: '3 2\n-5 0 5\n-2 3', expectedOutput: '-5 -2 0 3 5', isPublic: false },
    ],
  },
  {
    id: 'q-10',
    type: 'CODING',
    title: 'Valid Parentheses Matching',
    problemStatement: 'Given a string S consisting of characters "(", ")", "{", "}", "[" and "]", determine if the string is valid. Print "YES" if valid, otherwise "NO".',
    inputFormat: 'The input contains a single string S.',
    outputFormat: 'Print "YES" if all brackets are properly opened and closed in correct order, else "NO".',
    constraints: '1 ≤ |S| ≤ 10^5',
    explanation: 'Use a stack data structure to match brackets.',
    sampleTestCases: [
      {
        input: '()[]{}',
        output: 'YES',
        explanation: 'All brackets are properly closed in correct order.',
      },
    ],
    hiddenTestCases: [
      { input: '(]', output: 'NO' },
      { input: '([{}])', output: 'YES' },
      { input: '(((', output: 'NO' },
    ],
    difficulty: 'MEDIUM',
    tags: ['Stack', 'String'],
    points: 25,
    testCases: [
      { id: 'tc-1001', input: '()[]{}', expectedOutput: 'YES', isPublic: true },
      { id: 'tc-1002', input: '(]', expectedOutput: 'NO', isPublic: false },
      { id: 'tc-1003', input: '([{}])', expectedOutput: 'YES', isPublic: false },
      { id: 'tc-1004', input: '(((', expectedOutput: 'NO', isPublic: false },
    ],
  },
];

export const INITIAL_ASSESSMENTS: Assessment[] = [];

export const INITIAL_SESSIONS: CandidateSession[] = [];

export const INITIAL_SUBMISSIONS: Submission[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_DEPARTMENTS: Department[] = [];

export const INITIAL_CLASSES: Classroom[] = [];

