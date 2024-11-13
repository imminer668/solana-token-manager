import { 
    Box, 
    VStack, 
    Text, 
    HStack, 
    IconButton, 
    useClipboard,
    Tooltip,
    Badge,
    Divider
} from '@chakra-ui/react';
import { CopyIcon, CheckIcon, ExternalLinkIcon } from '@chakra-ui/icons';

interface PoolDetailsProps {
    details: {
        marketId: string;
        poolId: string;
        lpMint: string;
        baseVault: string;
        quoteVault: string;
        baseAmount: string;
        quoteAmount: string;
    };
}

interface AddressDisplayProps {
    label: string;
    value: string;
    type?: 'success' | 'info' | 'warning';
}

const AddressDisplay: React.FC<AddressDisplayProps> = ({ label, value, type = 'info' }) => {
    const { hasCopied, onCopy } = useClipboard(value);
    
    const colorScheme = {
        success: 'green',
        info: 'blue',
        warning: 'orange'
    }[type];

    return (
        <Box 
            w="100%" 
            p={3} 
            borderWidth={1} 
            borderRadius="md" 
            borderColor={`${colorScheme}.200`}
            bg={`${colorScheme}.50`}
        >
            <HStack justify="space-between" align="center">
                <VStack align="start" spacing={1}>
                    <Text fontSize="sm" color="gray.600">{label}</Text>
                    <Text 
                        fontSize="md" 
                        fontFamily="mono"
                        isTruncated
                        maxW="300px"
                    >
                        {value}
                    </Text>
                </VStack>
                <HStack>
                    <Tooltip label="在 Solscan 查看" placement="top">
                        <IconButton
                            aria-label="View on Solscan"
                            icon={<ExternalLinkIcon />}
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`https://solscan.io/account/${value}`, '_blank')}
                        />
                    </Tooltip>
                    <Tooltip label={hasCopied ? "已复制!" : "复制地址"} placement="top">
                        <IconButton
                            aria-label="Copy address"
                            icon={hasCopied ? <CheckIcon /> : <CopyIcon />}
                            size="sm"
                            variant="ghost"
                            onClick={onCopy}
                        />
                    </Tooltip>
                </HStack>
            </HStack>
        </Box>
    );
};

export const PoolDetails: React.FC<PoolDetailsProps> = ({ details }) => {
    return (
        <Box 
            w="100%" 
            p={6} 
            borderWidth={1} 
            borderRadius="lg" 
            borderColor="green.200"
            bg="white"
            boxShadow="sm"
        >
            <VStack align="start" spacing={4}>
                <HStack justify="space-between" w="100%">
                    <Text fontSize="xl" fontWeight="bold">流动性池创建成功</Text>
                    <Badge colorScheme="green" fontSize="md" px={3} py={1} borderRadius="full">
                        已完成
                    </Badge>
                </HStack>
                
                <Divider />

                <VStack spacing={4} w="100%">
                    <AddressDisplay 
                        label="流动性池 ID" 
                        value={details.poolId}
                        type="success"
                    />
                    
                    <AddressDisplay 
                        label="LP 代币地址" 
                        value={details.lpMint}
                        type="warning"
                    />

                    <HStack w="100%" spacing={4}>
                        <AddressDisplay 
                            label="基础代币金库" 
                            value={details.baseVault} 
                        />
                        <AddressDisplay 
                            label="报价代币金库" 
                            value={details.quoteVault}
                        />
                    </HStack>

                    <Box 
                        w="100%" 
                        p={4} 
                        bg="green.50" 
                        borderRadius="md"
                        borderWidth={1}
                        borderColor="green.200"
                    >
                        <HStack justify="space-between">
                            <VStack align="start" spacing={1}>
                                <Text fontSize="sm" color="gray.600">已添加流动性</Text>
                                <Text fontSize="md" fontWeight="bold">
                                    {details.baseAmount} 代币 + {details.quoteAmount} SOL
                                </Text>
                            </VStack>
                            <Badge colorScheme="green">成功</Badge>
                        </HStack>
                    </Box>
                </VStack>
            </VStack>
        </Box>
    );
}; 