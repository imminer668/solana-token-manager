import {
    Box,
    HStack,
    Input,
    Button,
    Text,
    Image,
    VStack,
    NumberInput,
    NumberInputField,
} from '@chakra-ui/react';

interface TokenInputProps {
    value: string;
    onChange?: (value: string) => void;
    token: {
        mint: string;
        symbol: string;
        icon?: string;
    } | null;
    onTokenSelect: () => void;
    balance?: number;
    isOutput?: boolean;
}

export const TokenInput: React.FC<TokenInputProps> = ({
    value,
    onChange,
    token,
    onTokenSelect,
    balance,
    isOutput = false,
}) => {
    return (
        <Box borderWidth={1} borderRadius="lg" p={4} w="full">
            <VStack align="stretch" spacing={2}>
                <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">
                        {isOutput ? "获得数量" : "支付数量"}
                    </Text>
                    {balance !== undefined && (
                        <Text fontSize="sm" color="gray.500">
                            余额: {balance}
                        </Text>
                    )}
                </HStack>
                
                <HStack>
                    <NumberInput
                        value={value}
                        onChange={onChange}
                        isReadOnly={isOutput}
                        flex={1}
                    >
                        <NumberInputField placeholder="0.0" />
                    </NumberInput>
                    
                    <Button 
                        onClick={onTokenSelect}
                        minW="120px"
                        variant="outline"
                    >
                        <HStack>
                            {token?.icon && (
                                <Image 
                                    src={token.icon} 
                                    boxSize="20px"
                                    borderRadius="full"
                                />
                            )}
                            <Text>{token?.symbol || "选择代币"}</Text>
                        </HStack>
                    </Button>
                </HStack>
            </VStack>
        </Box>
    );
}; 