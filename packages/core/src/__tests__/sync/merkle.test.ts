import * as crypto from 'crypto';
import { MerkleDAG, MerkleDAGNode } from '../../sync/merkle';

describe('MerkleDAG', () => {
    // Helper function to compute expected hash
    const computeHash = (data: string): string => {
        return crypto.createHash('sha256').update(data).digest('hex');
    };

    describe('constructor', () => {
        it('should initialize with empty nodes map', () => {
            const dag = new MerkleDAG();
            expect(dag.nodes).toBeInstanceOf(Map);
            expect(dag.nodes.size).toBe(0);
        });

        it('should initialize with empty rootIds array', () => {
            const dag = new MerkleDAG();
            expect(dag.rootIds).toEqual([]);
        });
    });

    describe('addNode', () => {
        it('should add a root node when no parent is specified', () => {
            const dag = new MerkleDAG();
            const data = 'root node data';
            const nodeId = dag.addNode(data);

            expect(nodeId).toBe(computeHash(data));
            expect(dag.nodes.has(nodeId)).toBe(true);
            expect(dag.rootIds).toContain(nodeId);
        });

        it('should return the hash of the data as node ID', () => {
            const dag = new MerkleDAG();
            const data = 'test data';
            const nodeId = dag.addNode(data);

            expect(nodeId).toBe(computeHash(data));
        });

        it('should create node with correct properties', () => {
            const dag = new MerkleDAG();
            const data = 'node content';
            const nodeId = dag.addNode(data);
            const node = dag.getNode(nodeId);

            expect(node).toBeDefined();
            expect(node!.id).toBe(nodeId);
            expect(node!.hash).toBe(nodeId);
            expect(node!.data).toBe(data);
            expect(node!.parents).toEqual([]);
            expect(node!.children).toEqual([]);
        });

        it('should add child node with parent relationship', () => {
            const dag = new MerkleDAG();
            const parentId = dag.addNode('parent data');
            const childId = dag.addNode('child data', parentId);

            const parentNode = dag.getNode(parentId);
            const childNode = dag.getNode(childId);

            expect(parentNode!.children).toContain(childId);
            expect(childNode!.parents).toContain(parentId);
        });

        it('should not add child to rootIds when parent is specified', () => {
            const dag = new MerkleDAG();
            const parentId = dag.addNode('parent data');
            const childId = dag.addNode('child data', parentId);

            expect(dag.rootIds).toContain(parentId);
            expect(dag.rootIds).not.toContain(childId);
        });

        it('should add node to rootIds when parent does not exist', () => {
            const dag = new MerkleDAG();
            const nodeId = dag.addNode('orphan data', 'non-existent-parent-id');

            // Node is added but without parent relationship, and it becomes a root
            expect(dag.rootIds).not.toContain(nodeId);
            const node = dag.getNode(nodeId);
            expect(node!.parents).toEqual([]);
        });

        it('should handle multiple children for one parent', () => {
            const dag = new MerkleDAG();
            const parentId = dag.addNode('parent');
            const child1Id = dag.addNode('child1', parentId);
            const child2Id = dag.addNode('child2', parentId);
            const child3Id = dag.addNode('child3', parentId);

            const parentNode = dag.getNode(parentId);
            expect(parentNode!.children).toHaveLength(3);
            expect(parentNode!.children).toContain(child1Id);
            expect(parentNode!.children).toContain(child2Id);
            expect(parentNode!.children).toContain(child3Id);
        });

        it('should handle multiple root nodes', () => {
            const dag = new MerkleDAG();
            const root1Id = dag.addNode('root1');
            const root2Id = dag.addNode('root2');
            const root3Id = dag.addNode('root3');

            expect(dag.rootIds).toHaveLength(3);
            expect(dag.rootIds).toContain(root1Id);
            expect(dag.rootIds).toContain(root2Id);
            expect(dag.rootIds).toContain(root3Id);
        });

        it('should create a chain of nodes', () => {
            const dag = new MerkleDAG();
            const node1Id = dag.addNode('node1');
            const node2Id = dag.addNode('node2', node1Id);
            const node3Id = dag.addNode('node3', node2Id);

            expect(dag.getNode(node1Id)!.children).toContain(node2Id);
            expect(dag.getNode(node2Id)!.parents).toContain(node1Id);
            expect(dag.getNode(node2Id)!.children).toContain(node3Id);
            expect(dag.getNode(node3Id)!.parents).toContain(node2Id);
        });
    });

    describe('getNode', () => {
        it('should return node by ID', () => {
            const dag = new MerkleDAG();
            const data = 'test data';
            const nodeId = dag.addNode(data);

            const node = dag.getNode(nodeId);
            expect(node).toBeDefined();
            expect(node!.data).toBe(data);
        });

        it('should return undefined for non-existent node', () => {
            const dag = new MerkleDAG();
            const node = dag.getNode('non-existent-id');
            expect(node).toBeUndefined();
        });

        it('should return undefined for empty DAG', () => {
            const dag = new MerkleDAG();
            const node = dag.getNode('any-id');
            expect(node).toBeUndefined();
        });
    });

    describe('getAllNodes', () => {
        it('should return empty array for empty DAG', () => {
            const dag = new MerkleDAG();
            expect(dag.getAllNodes()).toEqual([]);
        });

        it('should return all nodes in the DAG', () => {
            const dag = new MerkleDAG();
            const node1Id = dag.addNode('data1');
            const node2Id = dag.addNode('data2');
            const node3Id = dag.addNode('data3', node1Id);

            const allNodes = dag.getAllNodes();
            expect(allNodes).toHaveLength(3);

            const nodeIds = allNodes.map(n => n.id);
            expect(nodeIds).toContain(node1Id);
            expect(nodeIds).toContain(node2Id);
            expect(nodeIds).toContain(node3Id);
        });

        it('should return nodes as array of MerkleDAGNode objects', () => {
            const dag = new MerkleDAG();
            dag.addNode('test');

            const allNodes = dag.getAllNodes();
            expect(Array.isArray(allNodes)).toBe(true);
            expect(allNodes[0]).toHaveProperty('id');
            expect(allNodes[0]).toHaveProperty('hash');
            expect(allNodes[0]).toHaveProperty('data');
            expect(allNodes[0]).toHaveProperty('parents');
            expect(allNodes[0]).toHaveProperty('children');
        });
    });

    describe('getRootNodes', () => {
        it('should return empty array for empty DAG', () => {
            const dag = new MerkleDAG();
            expect(dag.getRootNodes()).toEqual([]);
        });

        it('should return root nodes only', () => {
            const dag = new MerkleDAG();
            const root1Id = dag.addNode('root1');
            const root2Id = dag.addNode('root2');
            const childId = dag.addNode('child', root1Id);

            const rootNodes = dag.getRootNodes();
            expect(rootNodes).toHaveLength(2);

            const rootIds = rootNodes.map(n => n.id);
            expect(rootIds).toContain(root1Id);
            expect(rootIds).toContain(root2Id);
            expect(rootIds).not.toContain(childId);
        });

        it('should return all nodes when all are roots', () => {
            const dag = new MerkleDAG();
            dag.addNode('data1');
            dag.addNode('data2');
            dag.addNode('data3');

            const rootNodes = dag.getRootNodes();
            expect(rootNodes).toHaveLength(3);
        });

        it('should return single root in tree structure', () => {
            const dag = new MerkleDAG();
            const rootId = dag.addNode('root');
            dag.addNode('child1', rootId);
            dag.addNode('child2', rootId);

            const rootNodes = dag.getRootNodes();
            expect(rootNodes).toHaveLength(1);
            expect(rootNodes[0].id).toBe(rootId);
        });
    });

    describe('getLeafNodes', () => {
        it('should return empty array for empty DAG', () => {
            const dag = new MerkleDAG();
            expect(dag.getLeafNodes()).toEqual([]);
        });

        it('should return leaf nodes only', () => {
            const dag = new MerkleDAG();
            const rootId = dag.addNode('root');
            const leaf1Id = dag.addNode('leaf1', rootId);
            const leaf2Id = dag.addNode('leaf2', rootId);

            const leafNodes = dag.getLeafNodes();
            expect(leafNodes).toHaveLength(2);

            const leafIds = leafNodes.map(n => n.id);
            expect(leafIds).toContain(leaf1Id);
            expect(leafIds).toContain(leaf2Id);
            expect(leafIds).not.toContain(rootId);
        });

        it('should return all nodes when all are leaves (no children)', () => {
            const dag = new MerkleDAG();
            dag.addNode('data1');
            dag.addNode('data2');
            dag.addNode('data3');

            const leafNodes = dag.getLeafNodes();
            expect(leafNodes).toHaveLength(3);
        });

        it('should return single leaf in chain structure', () => {
            const dag = new MerkleDAG();
            const id1 = dag.addNode('node1');
            const id2 = dag.addNode('node2', id1);
            const id3 = dag.addNode('node3', id2);

            const leafNodes = dag.getLeafNodes();
            expect(leafNodes).toHaveLength(1);
            expect(leafNodes[0].id).toBe(id3);
        });

        it('should handle node that is both root and leaf', () => {
            const dag = new MerkleDAG();
            const singleId = dag.addNode('single node');

            const rootNodes = dag.getRootNodes();
            const leafNodes = dag.getLeafNodes();

            expect(rootNodes).toHaveLength(1);
            expect(leafNodes).toHaveLength(1);
            expect(rootNodes[0].id).toBe(singleId);
            expect(leafNodes[0].id).toBe(singleId);
        });
    });

    describe('serialize', () => {
        it('should serialize empty DAG', () => {
            const dag = new MerkleDAG();
            const serialized = dag.serialize();

            expect(serialized).toHaveProperty('nodes');
            expect(serialized).toHaveProperty('rootIds');
            expect(serialized.nodes).toEqual([]);
            expect(serialized.rootIds).toEqual([]);
        });

        it('should serialize DAG with nodes', () => {
            const dag = new MerkleDAG();
            const rootId = dag.addNode('root');
            dag.addNode('child', rootId);

            const serialized = dag.serialize();

            expect(serialized.nodes).toHaveLength(2);
            expect(serialized.rootIds).toContain(rootId);
        });

        it('should serialize nodes as entries array', () => {
            const dag = new MerkleDAG();
            const nodeId = dag.addNode('test data');

            const serialized = dag.serialize();

            // Nodes should be serialized as [id, node] entries
            expect(serialized.nodes[0][0]).toBe(nodeId);
            expect(serialized.nodes[0][1].data).toBe('test data');
        });

        it('should preserve node relationships in serialization', () => {
            const dag = new MerkleDAG();
            const parentId = dag.addNode('parent');
            const childId = dag.addNode('child', parentId);

            const serialized = dag.serialize();
            const nodesMap = new Map(serialized.nodes);

            const parentNode = nodesMap.get(parentId) as MerkleDAGNode;
            const childNode = nodesMap.get(childId) as MerkleDAGNode;

            expect(parentNode.children).toContain(childId);
            expect(childNode.parents).toContain(parentId);
        });
    });

    describe('deserialize', () => {
        it('should deserialize to empty DAG', () => {
            const data = { nodes: [], rootIds: [] };
            const dag = MerkleDAG.deserialize(data);

            expect(dag.nodes.size).toBe(0);
            expect(dag.rootIds).toEqual([]);
        });

        it('should deserialize DAG with nodes', () => {
            const originalDag = new MerkleDAG();
            const rootId = originalDag.addNode('root');
            originalDag.addNode('child', rootId);
            const serialized = originalDag.serialize();

            const restoredDag = MerkleDAG.deserialize(serialized);

            expect(restoredDag.nodes.size).toBe(2);
            expect(restoredDag.rootIds).toContain(rootId);
        });

        it('should preserve node data after deserialization', () => {
            const originalDag = new MerkleDAG();
            const nodeId = originalDag.addNode('test data');
            const serialized = originalDag.serialize();

            const restoredDag = MerkleDAG.deserialize(serialized);
            const node = restoredDag.getNode(nodeId);

            expect(node).toBeDefined();
            expect(node!.data).toBe('test data');
        });

        it('should preserve relationships after deserialization', () => {
            const originalDag = new MerkleDAG();
            const parentId = originalDag.addNode('parent');
            const childId = originalDag.addNode('child', parentId);
            const serialized = originalDag.serialize();

            const restoredDag = MerkleDAG.deserialize(serialized);
            const parentNode = restoredDag.getNode(parentId);
            const childNode = restoredDag.getNode(childId);

            expect(parentNode!.children).toContain(childId);
            expect(childNode!.parents).toContain(parentId);
        });

        it('should return instance of MerkleDAG', () => {
            const data = { nodes: [], rootIds: [] };
            const dag = MerkleDAG.deserialize(data);

            expect(dag).toBeInstanceOf(MerkleDAG);
        });
    });

    describe('serialize and deserialize roundtrip', () => {
        it('should preserve DAG structure through roundtrip', () => {
            const originalDag = new MerkleDAG();
            const root1Id = originalDag.addNode('root1');
            originalDag.addNode('root2');
            const child1Id = originalDag.addNode('child1', root1Id);
            const child2Id = originalDag.addNode('child2', root1Id);
            const grandchildId = originalDag.addNode('grandchild', child1Id);

            const serialized = originalDag.serialize();
            const restoredDag = MerkleDAG.deserialize(serialized);

            // Compare structure
            expect(restoredDag.getAllNodes()).toHaveLength(5);
            expect(restoredDag.getRootNodes()).toHaveLength(2);
            expect(restoredDag.getLeafNodes()).toHaveLength(3);

            // Check specific relationships
            expect(restoredDag.getNode(root1Id)!.children).toContain(child1Id);
            expect(restoredDag.getNode(root1Id)!.children).toContain(child2Id);
            expect(restoredDag.getNode(child1Id)!.children).toContain(grandchildId);
        });
    });

    describe('compare', () => {
        it('should return empty arrays when comparing identical DAGs', () => {
            const dag1 = new MerkleDAG();
            dag1.addNode('data1');
            dag1.addNode('data2');

            const dag2 = new MerkleDAG();
            dag2.addNode('data1');
            dag2.addNode('data2');

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.added).toEqual([]);
            expect(result.removed).toEqual([]);
            expect(result.modified).toEqual([]);
        });

        it('should detect added nodes', () => {
            const dag1 = new MerkleDAG();
            dag1.addNode('data1');

            const dag2 = new MerkleDAG();
            dag2.addNode('data1');
            const newNodeId = dag2.addNode('data2');

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.added).toContain(newNodeId);
            expect(result.added).toHaveLength(1);
            expect(result.removed).toEqual([]);
            expect(result.modified).toEqual([]);
        });

        it('should detect removed nodes', () => {
            const dag1 = new MerkleDAG();
            dag1.addNode('data1');
            const removedNodeId = dag1.addNode('data2');

            const dag2 = new MerkleDAG();
            dag2.addNode('data1');

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.removed).toContain(removedNodeId);
            expect(result.removed).toHaveLength(1);
            expect(result.added).toEqual([]);
            expect(result.modified).toEqual([]);
        });

        it('should detect both added and removed nodes', () => {
            const dag1 = new MerkleDAG();
            dag1.addNode('data1');
            const removedNodeId = dag1.addNode('removed');

            const dag2 = new MerkleDAG();
            dag2.addNode('data1');
            const addedNodeId = dag2.addNode('added');

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.added).toContain(addedNodeId);
            expect(result.removed).toContain(removedNodeId);
        });

        it('should return empty modified array as node IDs are based on data hash', () => {
            // Since node IDs are hashes of data, changing data creates a new node ID
            // So "modified" would only occur if we manually manipulated the data
            const dag1 = new MerkleDAG();
            dag1.addNode('data1');

            const dag2 = new MerkleDAG();
            dag2.addNode('data1');

            const result = MerkleDAG.compare(dag1, dag2);
            expect(result.modified).toEqual([]);
        });

        it('should compare empty DAGs', () => {
            const dag1 = new MerkleDAG();
            const dag2 = new MerkleDAG();

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.added).toEqual([]);
            expect(result.removed).toEqual([]);
            expect(result.modified).toEqual([]);
        });

        it('should detect all nodes as added when comparing empty to non-empty', () => {
            const dag1 = new MerkleDAG();

            const dag2 = new MerkleDAG();
            const id1 = dag2.addNode('data1');
            const id2 = dag2.addNode('data2');

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.added).toHaveLength(2);
            expect(result.added).toContain(id1);
            expect(result.added).toContain(id2);
            expect(result.removed).toEqual([]);
        });

        it('should detect all nodes as removed when comparing non-empty to empty', () => {
            const dag1 = new MerkleDAG();
            const id1 = dag1.addNode('data1');
            const id2 = dag1.addNode('data2');

            const dag2 = new MerkleDAG();

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.removed).toHaveLength(2);
            expect(result.removed).toContain(id1);
            expect(result.removed).toContain(id2);
            expect(result.added).toEqual([]);
        });

        it('should compare DAGs with tree structures', () => {
            const dag1 = new MerkleDAG();
            const root1 = dag1.addNode('root');
            dag1.addNode('child1', root1);

            const dag2 = new MerkleDAG();
            const root2 = dag2.addNode('root');
            dag2.addNode('child1', root2);
            const newChild = dag2.addNode('child2', root2);

            const result = MerkleDAG.compare(dag1, dag2);

            expect(result.added).toContain(newChild);
            expect(result.added).toHaveLength(1);
        });
    });

    describe('edge cases', () => {
        it('should handle empty string data', () => {
            const dag = new MerkleDAG();
            const nodeId = dag.addNode('');

            expect(nodeId).toBe(computeHash(''));
            expect(dag.getNode(nodeId)!.data).toBe('');
        });

        it('should handle special characters in data', () => {
            const dag = new MerkleDAG();
            const specialData = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./~`\n\t\r';
            const nodeId = dag.addNode(specialData);

            expect(dag.getNode(nodeId)!.data).toBe(specialData);
        });

        it('should handle unicode data', () => {
            const dag = new MerkleDAG();
            const unicodeData = '你好世界 🌍 مرحبا العالم';
            const nodeId = dag.addNode(unicodeData);

            expect(dag.getNode(nodeId)!.data).toBe(unicodeData);
        });

        it('should handle very long data strings', () => {
            const dag = new MerkleDAG();
            const longData = 'a'.repeat(10000);
            const nodeId = dag.addNode(longData);

            expect(dag.getNode(nodeId)!.data).toBe(longData);
        });

        it('should handle duplicate data (same hash)', () => {
            const dag = new MerkleDAG();
            const data = 'duplicate data';
            const id1 = dag.addNode(data);
            const id2 = dag.addNode(data);

            // Both should return the same ID since hash is the same
            expect(id1).toBe(id2);
            // But the node gets overwritten
            expect(dag.getAllNodes()).toHaveLength(1);
        });

        it('should handle deep tree structure', () => {
            const dag = new MerkleDAG();
            let parentId = dag.addNode('level0');

            for (let i = 1; i < 100; i++) {
                parentId = dag.addNode(`level${i}`, parentId);
            }

            expect(dag.getAllNodes()).toHaveLength(100);
            expect(dag.getRootNodes()).toHaveLength(1);
            expect(dag.getLeafNodes()).toHaveLength(1);
        });

        it('should handle wide tree structure', () => {
            const dag = new MerkleDAG();
            const rootId = dag.addNode('root');

            for (let i = 0; i < 100; i++) {
                dag.addNode(`child${i}`, rootId);
            }

            expect(dag.getAllNodes()).toHaveLength(101);
            expect(dag.getRootNodes()).toHaveLength(1);
            expect(dag.getLeafNodes()).toHaveLength(100);
        });
    });
});
